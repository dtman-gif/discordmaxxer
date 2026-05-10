// winaudio — per-output-device WASAPI loopback capture for discordmaxxer.
//
// Why this exists: Vesktop's screenshare audio path on Windows is
// `streams.audio = "loopback"` (Electron's loopback follows the SYSTEM
// DEFAULT output device). When users run Voicemeeter / VB-Cable /
// EqualizerAPO and set a virtual mix as default, loopback grabs the
// virtual device — not their physical headset / speakers / actual game
// audio. This module captures from a SPECIFIC endpoint by ID.
//
// Architecture:
//   - Single capture allowed at a time (Discord screenshares one stream).
//   - Capture thread does its own COM init (MTA), runs the WASAPI loop,
//     and emits PCM via Napi::ThreadSafeFunction.NonBlockingCall so the
//     audio thread is never blocked on the JS event loop.
//   - WASAPI mix-format (typically float32 stereo @ 48kHz on Win10/11)
//     is returned to JS so the caller can decode the buffer correctly.
//   - Silence chunks (AUDCLNT_BUFFERFLAGS_SILENT) come through as zero-
//     length data + silent=true. Caller decides whether to render
//     silence or skip.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <napi.h>

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <avrt.h>
#include <combaseapi.h>
#include <objbase.h>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

// ─── Helpers ──────────────────────────────────────────────────────────

// COM smart-pointer-lite. Releases on destruction.
template <typename T>
struct ComPtr {
    T* p = nullptr;
    ComPtr() = default;
    explicit ComPtr(T* raw) : p(raw) {}
    ~ComPtr() { if (p) p->Release(); }
    ComPtr(const ComPtr&) = delete;
    ComPtr& operator=(const ComPtr&) = delete;
    ComPtr(ComPtr&& o) noexcept : p(o.p) { o.p = nullptr; }
    ComPtr& operator=(ComPtr&& o) noexcept { if (this != &o) { if (p) p->Release(); p = o.p; o.p = nullptr; } return *this; }
    T* operator->() const { return p; }
    T** operator&() { return &p; }
    explicit operator bool() const { return p != nullptr; }
    T* get() const { return p; }
    T* release() { T* r = p; p = nullptr; return r; }
    void reset(T* raw = nullptr) { if (p) p->Release(); p = raw; }
};

// CoTaskMemFree wrapper for LPWSTR / WAVEFORMATEX*.
struct CoTaskMemFreeDeleter { template <typename T> void operator()(T* p) const { if (p) CoTaskMemFree(p); } };

template <typename T>
using CoMemPtr = std::unique_ptr<T, CoTaskMemFreeDeleter>;

std::string utf16_to_utf8(const wchar_t* w) {
    if (!w) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w, -1, out.data(), len, nullptr, nullptr);
    return out;
}

std::wstring utf8_to_utf16(const std::string& s) {
    if (s.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(len), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), len);
    return out;
}

// Per-thread COM initialization scope guard.
struct ComScope {
    HRESULT hr;
    ComScope() { hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED); }
    ~ComScope() { if (SUCCEEDED(hr) && hr != RPC_E_CHANGED_MODE) CoUninitialize(); }
    bool ok() const { return SUCCEEDED(hr) || hr == RPC_E_CHANGED_MODE || hr == S_FALSE; }
};

// ─── Capture state (single-instance) ──────────────────────────────────

struct AudioChunkPayload {
    std::vector<uint8_t> data;
    uint32_t frameCount = 0;
    int64_t timestamp100ns = 0;
    bool silent = false;
};

struct CaptureState {
    std::atomic<bool> running{false};
    std::thread thread;
    std::wstring deviceId;
    Napi::ThreadSafeFunction tsfn;

    // Format echoed back to JS at startCapture time.
    uint32_t sampleRate = 0;
    uint16_t channels = 0;
    uint16_t bitsPerSample = 0;
    bool isFloat = false;
};

CaptureState g_capture;
std::mutex g_captureMutex; // serializes start/stop calls from JS thread

// ─── Device enumeration ───────────────────────────────────────────────

Napi::Value ListOutputDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    ComScope com;
    if (!com.ok()) {
        Napi::Error::New(env, "CoInitializeEx failed").ThrowAsJavaScriptException();
        return env.Null();
    }

    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
    if (FAILED(hr)) {
        Napi::Error::New(env, "CoCreateInstance(MMDeviceEnumerator) failed: 0x" + std::to_string(hr)).ThrowAsJavaScriptException();
        return env.Null();
    }

    // Identify the default render device so we can mark it.
    std::wstring defaultId;
    {
        ComPtr<IMMDevice> defDev;
        if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &defDev))) {
            LPWSTR id = nullptr;
            if (SUCCEEDED(defDev->GetId(&id)) && id) {
                defaultId = id;
                CoTaskMemFree(id);
            }
        }
    }

    ComPtr<IMMDeviceCollection> coll;
    hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &coll);
    if (FAILED(hr)) {
        Napi::Error::New(env, "EnumAudioEndpoints failed: 0x" + std::to_string(hr)).ThrowAsJavaScriptException();
        return env.Null();
    }

    UINT count = 0;
    coll->GetCount(&count);

    Napi::Array arr = Napi::Array::New(env, count);
    for (UINT i = 0; i < count; i++) {
        ComPtr<IMMDevice> dev;
        if (FAILED(coll->Item(i, &dev))) continue;

        LPWSTR rawId = nullptr;
        if (FAILED(dev->GetId(&rawId)) || !rawId) continue;
        std::wstring id(rawId);
        CoTaskMemFree(rawId);

        // Friendly name via property store.
        std::string friendly = "Unknown device";
        ComPtr<IPropertyStore> props;
        if (SUCCEEDED(dev->OpenPropertyStore(STGM_READ, &props))) {
            PROPVARIANT name;
            PropVariantInit(&name);
            if (SUCCEEDED(props->GetValue(PKEY_Device_FriendlyName, &name)) && name.vt == VT_LPWSTR) {
                friendly = utf16_to_utf8(name.pwszVal);
            }
            PropVariantClear(&name);
        }

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("id", Napi::String::New(env, utf16_to_utf8(id.c_str())));
        obj.Set("name", Napi::String::New(env, friendly));
        obj.Set("isDefault", Napi::Boolean::New(env, !defaultId.empty() && id == defaultId));
        arr.Set(i, obj);
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("devices", arr);
    return result;
}

// ─── Capture thread ───────────────────────────────────────────────────

// Each PCM packet flows: capture thread → TSFN.NonBlockingCall(lambda) →
// JS thread → lambda runs in JS context → builds JS chunk → invokes user
// callback. We use the lambda overload (not the typed-data overload) so
// we don't have to wrestle with the templated Finalizer signatures.

void CaptureThreadMain() {
    ComScope com;
    if (!com.ok()) return;

    // Boost thread priority — we're on the audio path. AvSetMmThread tags
    // us as "Audio" class so the scheduler prefers us over normal work.
    DWORD taskIndex = 0;
    HANDLE mmcssHandle = AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex);

    auto cleanup = [&]() {
        if (mmcssHandle) AvRevertMmThreadCharacteristics(mmcssHandle);
    };

    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
    if (FAILED(hr)) { cleanup(); return; }

    ComPtr<IMMDevice> device;
    hr = enumerator->GetDevice(g_capture.deviceId.c_str(), &device);
    if (FAILED(hr)) { cleanup(); return; }

    ComPtr<IAudioClient> client;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                          reinterpret_cast<void**>(&client));
    if (FAILED(hr)) { cleanup(); return; }

    WAVEFORMATEX* mixFormatRaw = nullptr;
    hr = client->GetMixFormat(&mixFormatRaw);
    if (FAILED(hr) || !mixFormatRaw) { cleanup(); return; }
    CoMemPtr<WAVEFORMATEX> mixFormat(mixFormatRaw);

    // Echo the format back through the global (read by startCapture
    // before this thread is launched — the JS-visible CaptureFormat is
    // populated synchronously). We write here so a future hot-swap path
    // can still read accurate format info.
    g_capture.sampleRate = mixFormat->nSamplesPerSec;
    g_capture.channels = mixFormat->nChannels;
    g_capture.bitsPerSample = mixFormat->wBitsPerSample;
    g_capture.isFloat = false;
    if (mixFormat->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
        g_capture.isFloat = true;
    } else if (mixFormat->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
        auto* ext = reinterpret_cast<WAVEFORMATEXTENSIBLE*>(mixFormat.get());
        if (ext->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) g_capture.isFloat = true;
    }

    // 200000 hns = 20ms buffer. Loopback-capable share-mode stream.
    HANDLE eventHandle = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!eventHandle) { cleanup(); return; }

    hr = client->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        200000, // 20 ms in 100-ns units
        0,
        mixFormat.get(),
        nullptr);
    if (FAILED(hr)) { CloseHandle(eventHandle); cleanup(); return; }

    hr = client->SetEventHandle(eventHandle);
    if (FAILED(hr)) { CloseHandle(eventHandle); cleanup(); return; }

    ComPtr<IAudioCaptureClient> capture;
    hr = client->GetService(__uuidof(IAudioCaptureClient),
                            reinterpret_cast<void**>(&capture));
    if (FAILED(hr)) { CloseHandle(eventHandle); cleanup(); return; }

    hr = client->Start();
    if (FAILED(hr)) { CloseHandle(eventHandle); cleanup(); return; }

    const uint32_t frameSize = mixFormat->nBlockAlign;

    while (g_capture.running.load(std::memory_order_acquire)) {
        DWORD wait = WaitForSingleObject(eventHandle, 200); // 200ms tick
        if (wait == WAIT_TIMEOUT) continue;
        if (wait != WAIT_OBJECT_0) break;

        // Drain everything available this tick.
        UINT32 packetFrames = 0;
        while (SUCCEEDED(capture->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
            BYTE* dataPtr = nullptr;
            UINT32 framesRead = 0;
            DWORD flags = 0;
            UINT64 devicePosition = 0;
            UINT64 qpcPosition = 0;
            hr = capture->GetBuffer(&dataPtr, &framesRead, &flags,
                                    &devicePosition, &qpcPosition);
            if (FAILED(hr)) break;

            const bool silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;

            // Build the payload + queue a lambda that runs on the JS thread
            // to convert it into a JS object and invoke the user callback.
            auto payload = std::make_shared<AudioChunkPayload>();
            payload->frameCount = framesRead;
            payload->timestamp100ns = static_cast<int64_t>(qpcPosition);
            payload->silent = silent;
            if (!silent && framesRead > 0 && dataPtr) {
                size_t bytes = static_cast<size_t>(framesRead) * frameSize;
                payload->data.assign(dataPtr, dataPtr + bytes);
            }

            capture->ReleaseBuffer(framesRead);

            napi_status status = g_capture.tsfn.NonBlockingCall(
                [payload](Napi::Env env, Napi::Function jsCallback) {
                    // Hand off PCM bytes to a Buffer with a finalizer that
                    // releases our heap vector on GC. Keeps it zero-copy.
                    auto* heap = new std::vector<uint8_t>(std::move(payload->data));
                    Napi::Buffer<uint8_t> buf = Napi::Buffer<uint8_t>::New(
                        env, heap->data(), heap->size(),
                        [](Napi::Env, uint8_t*, std::vector<uint8_t>* v) { delete v; },
                        heap);

                    Napi::Object chunk = Napi::Object::New(env);
                    chunk.Set("data", buf);
                    chunk.Set("frameCount", Napi::Number::New(env, payload->frameCount));
                    chunk.Set("timestamp100ns", Napi::BigInt::New(env, payload->timestamp100ns));
                    chunk.Set("silent", Napi::Boolean::New(env, payload->silent));

                    jsCallback.Call({ chunk });
                });
            if (status != napi_ok) {
                // JS side closed the queue or it's full — bail; capture
                // packets dropped on the floor when JS can't keep up.
                g_capture.running.store(false, std::memory_order_release);
                break;
            }
        }
    }

    client->Stop();
    CloseHandle(eventHandle);
    cleanup();
}

// ─── JS-facing entry points ───────────────────────────────────────────

Napi::Value StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "startCapture(deviceId: string, onChunk: (chunk) => void)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::lock_guard<std::mutex> lock(g_captureMutex);
    if (g_capture.running.load()) {
        Napi::Error::New(env, "another capture is already active — stopCapture() first").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string deviceIdUtf8 = info[0].As<Napi::String>().Utf8Value();
    Napi::Function cb = info[1].As<Napi::Function>();

    g_capture.deviceId = utf8_to_utf16(deviceIdUtf8);

    // Probe the device's mix format synchronously so we can return the
    // CaptureFormat to JS before launching the capture thread. The thread
    // then re-acquires + caches everything for the actual capture.
    {
        ComScope com;
        if (!com.ok()) {
            Napi::Error::New(env, "CoInitializeEx failed").ThrowAsJavaScriptException();
            return env.Null();
        }
        ComPtr<IMMDeviceEnumerator> enumerator;
        HRESULT hr = CoCreateInstance(
            __uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
            __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
        if (FAILED(hr)) {
            Napi::Error::New(env, "MMDeviceEnumerator unavailable").ThrowAsJavaScriptException();
            return env.Null();
        }
        ComPtr<IMMDevice> dev;
        hr = enumerator->GetDevice(g_capture.deviceId.c_str(), &dev);
        if (FAILED(hr)) {
            Napi::Error::New(env, "device not found: " + deviceIdUtf8).ThrowAsJavaScriptException();
            return env.Null();
        }
        ComPtr<IAudioClient> client;
        hr = dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                           reinterpret_cast<void**>(&client));
        if (FAILED(hr)) {
            Napi::Error::New(env, "IAudioClient activation failed").ThrowAsJavaScriptException();
            return env.Null();
        }
        WAVEFORMATEX* fmtRaw = nullptr;
        hr = client->GetMixFormat(&fmtRaw);
        if (FAILED(hr) || !fmtRaw) {
            Napi::Error::New(env, "GetMixFormat failed").ThrowAsJavaScriptException();
            return env.Null();
        }
        CoMemPtr<WAVEFORMATEX> fmt(fmtRaw);
        g_capture.sampleRate = fmt->nSamplesPerSec;
        g_capture.channels = fmt->nChannels;
        g_capture.bitsPerSample = fmt->wBitsPerSample;
        g_capture.isFloat = false;
        if (fmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
            g_capture.isFloat = true;
        } else if (fmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
            auto* ext = reinterpret_cast<WAVEFORMATEXTENSIBLE*>(fmt.get());
            if (ext->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) g_capture.isFloat = true;
        }
    }

    // Build the format object NOW so the JS caller has it on resolution.
    Napi::Object format = Napi::Object::New(env);
    format.Set("sampleRate", Napi::Number::New(env, g_capture.sampleRate));
    format.Set("channels", Napi::Number::New(env, g_capture.channels));
    format.Set("bitsPerSample", Napi::Number::New(env, g_capture.bitsPerSample));
    format.Set("isFloat", Napi::Boolean::New(env, g_capture.isFloat));

    // Wire the thread-safe function. Queue is bounded — when the JS event
    // loop falls behind, NonBlockingCall returns napi_queue_full and the
    // capture thread drops the packet (better than back-pressure killing
    // the audio thread).
    g_capture.tsfn = Napi::ThreadSafeFunction::New(
        env,
        cb,
        "winaudio.capture",
        /*maxQueueSize*/ 64,
        /*initialThreadCount*/ 1);

    g_capture.running.store(true, std::memory_order_release);
    g_capture.thread = std::thread([] {
        CaptureThreadMain();
        // When the loop exits (stop was requested OR fatal error), release
        // our hold on the TSFN so JS-side resources can be GC'd.
        g_capture.tsfn.Release();
    });

    return format;
}

Napi::Value StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(g_captureMutex);
    if (!g_capture.running.load()) return env.Undefined();

    g_capture.running.store(false, std::memory_order_release);
    if (g_capture.thread.joinable()) g_capture.thread.join();

    return env.Undefined();
}

Napi::Value IsCapturing(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_capture.running.load());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("listOutputDevices", Napi::Function::New(env, ListOutputDevices));
    exports.Set("startCapture", Napi::Function::New(env, StartCapture));
    exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
    exports.Set("isCapturing", Napi::Function::New(env, IsCapturing));
    return exports;
}

} // namespace

NODE_API_MODULE(winaudio, Init)

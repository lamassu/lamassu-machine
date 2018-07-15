/*
 * Reference links:
 * @see https://apurv.me/accessing-and-streaming-webcam-in-nodejs-using-opencv-and-websockets/
 * @see https://github.com/lamassu/node-supyo
 * @see https://github.com/nenadmarkus/pico
 */

#include "types.h"
#include "thread.h"

using namespace v8;

uv_loop_t *loop;

void startCapture(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

#ifdef DEBUG_TIMES
    time2frame = getticks();
    time2face = getticks();
#endif

    if (bag != NULL && bag->started) {
        args.GetReturnValue().Set(Boolean::New(isolate, FALSE));
        return;
    }

    // released in stopCapture
    bag = new TMessage();

    // Check if opts is passed
    if (args.Length() < 1) {
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "First argument is missing")));
        return;
    }

    // First parameter is opts, which contains on Json object having width and height
    if (!args[0]->IsObject()) {
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "First argument must be object")));
        return;
    }

    Local<Object> params = args[0]->ToObject();

    // accept opts { width : number, height : number }
    if (params->Has(String::NewFromUtf8(isolate, "width")) &&
            params->Has(String::NewFromUtf8(isolate, "height"))) {
        bag->width  = params->Get(String::NewFromUtf8(isolate, "width"))->Int32Value();
        bag->height = params->Get(String::NewFromUtf8(isolate, "height"))->Int32Value();
        bag->resize = true;
    } else {
        bag->width  = 0;
        bag->height = 0;
        bag->resize = false;
    }
#ifdef DEBUG_MESSAGE
    printf("camera :: opts { width : %d, height : %d }\n", bag->width, bag->height);
#endif

    // accept opts { codec : string }
    if (params->Has(String::NewFromUtf8(isolate, "codec"))) {
        Local<String> val = params->Get(String::NewFromUtf8(isolate, "codec"))->ToString();
        bag->codec = stringValue(val);
    } else {
        bag->codec = std::string("");
    }
#ifdef DEBUG_MESSAGE
        printf("camera :: opts { codec : %s }\n", bag->codec.c_str());
#endif

    // accept opts { input : string }
    Local<Value> input = Number::New(isolate, 0);
    std::string inputString;
    if (params->Has(String::NewFromUtf8(isolate, "input"))) {
        Local<Value> input = params->Get(String::NewFromUtf8(isolate, "input"));
        if (!input->IsNumber()) {
            inputString = stringValue(input);
        }
    }
#ifdef DEBUG_MESSAGE
    printf("camera :: opts { input : %s }\n", inputString.c_str());
#endif

    // accept opts { faceDetect : boolean }
    if (params->Has(String::NewFromUtf8(isolate, "faceDetect"))) {
        bag->faceDetect = params->Get(String::NewFromUtf8(isolate, "faceDetect"))->BooleanValue();
    } else {
        bag->faceDetect = false;
    }
#ifdef DEBUG_MESSAGE
    printf("camera :: opts { faceDetect : %i }\n", bag->faceDetect);
#endif

    if (params->Has(String::NewFromUtf8(isolate, "frameCallback"))) {
        Local<Value> callback = params->Get(String::NewFromUtf8(isolate, "frameCallback"));
        if (!callback->IsFunction()) {
            isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "frameCallback must be a callback function")));
            return;
        } else {
            bag->callback.Reset(isolate, Handle<Function>::Cast(callback));
#ifdef DEBUG_MESSAGE
            printf("camera :: opts { frameCallback : true }\n");
#endif
        }
    }

#ifdef DEBUG_WINDOW
    cv::namedWindow("Preview", 1);
#endif

    // Initiate OpenCV camera
#ifdef DEBUG_MESSAGE
    printf("camera :: starting opencv VideoCapture %d\n", input->Int32Value());
#endif

    bag->capture = new cv::VideoCapture();
    bool opened = false;
    if (input->IsNumber()) {
        opened = bag->capture->open((int) input->Int32Value());
    } else if (!inputString.empty()) {
        opened = bag->capture->open(inputString);
    }

#ifdef DEBUG_MESSAGE
    printf("camera :: VideoCapture opened %d\n", opened);
#endif

    if (!opened) {
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "Error: Unable to open video capture")));
        return;
    }

    // https://stackoverflow.com/questions/27496698
    bag->capture->set(CV_CAP_PROP_MODE, CV_CAP_MODE_YUYV);

#ifdef DEBUG_WINDOW
    cv::waitKey(10);
#endif

#ifdef DEBUG_MESSAGE
    printf("camera :: starting thread\n");
#endif
    loop = uv_default_loop();

    uv_work_t* req = new uv_work_t();
    req->data = bag;

    // if callback parameter is specified
    if (!bag->callback.IsEmpty()) {
        async = uv_async_t();
        uv_async_init(loop, &async, (uv_async_cb) updateAsync);
    }

    // perform camera capture on a separate thread
    uv_queue_work(loop, req, cameraLoop, (uv_after_work_cb) cameraClose);

    m_brk++;
    bag->started = true;
    args.GetReturnValue().Set(Boolean::New(isolate, TRUE));
}

void stopCapture(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

    if (bag == NULL || !bag->started) {
        args.GetReturnValue().Set(Boolean::New(isolate, FALSE));
        return;
    }

    m_brk--;
    bag->started = false;

#ifdef DEBUG_WINDOW
    cv::destroyWindow("Preview");
#endif

#ifdef DEBUG_MESSAGE
    printf("camera :: stopping thread\n");
#endif
    uv_loop_close(loop);

    if (async.type != UV_UNKNOWN_HANDLE && !uv_is_closing((uv_handle_t *) &async)) {
        uv_close((uv_handle_t *) &async, NULL);
    }

    args.GetReturnValue().Set(Boolean::New(isolate, TRUE));
}

void isStarted(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

    bool result = (bag != NULL && bag->started) ? TRUE : FALSE;
    args.GetReturnValue().Set(Boolean::New(isolate, result));
}

void getFrameSize(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

    Local<Object> obj = Object::New(isolate);

    if (bag != NULL && bag->started) {
        obj->Set(String::NewFromUtf8(isolate, "width"),  Integer::New(isolate, bag->width));
        obj->Set(String::NewFromUtf8(isolate, "height"), Integer::New(isolate, bag->height));
    }

    args.GetReturnValue().Set(obj);
}

void init(Handle<Object> exports) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

    exports->Set(String::NewFromUtf8(isolate, "open"), FunctionTemplate::New(isolate, startCapture)->GetFunction());
    exports->Set(String::NewFromUtf8(isolate, "close"), FunctionTemplate::New(isolate, stopCapture)->GetFunction());
    exports->Set(String::NewFromUtf8(isolate, "isOpened"), FunctionTemplate::New(isolate, isStarted)->GetFunction());
    exports->Set(String::NewFromUtf8(isolate, "getFrameSize"), FunctionTemplate::New(isolate, getFrameSize)->GetFunction());
}

NODE_MODULE(camera, init);

/*
 * Reference links:
 * @see https://apurv.me/accessing-and-streaming-webcam-in-nodejs-using-opencv-and-websockets/
 * @see https://github.com/lamassu/node-supyo
 * @see https://github.com/nenadmarkus/pico
 */

#include "types.h"
#include "thread.h"
#include "supyo.h"

//using namespace v8;

uv_loop_t *loop;

void startCapture(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);

    time2frame = getticks();
    time2face  = getticks();

    if (bag != NULL && bag->started) {
        args.GetReturnValue().Set(Boolean::New(isolate, FALSE));
        return;
    }

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

    // released in stopCapture
    bag = new TMessage();
    bag->rcsq = NULL;
    bag->ndetections = 0;

    Local<Object> params = args[0]->ToObject();

    // accept opts { verbose : boolean }
    if (params->Has(String::NewFromUtf8(isolate, "verbose"))) {
        bag->verbose = params->Get(String::NewFromUtf8(isolate, "verbose"))->BooleanValue();
    } else {
        bag->verbose = false;
    }
    if (bag->verbose) {
        printf("camera :: opts { verbose : %i }\n", bag->verbose);
    }

    // accept opts { device : string|number }
    Local<Value> input = Number::New(isolate, 0);
    if (params->Has(String::NewFromUtf8(isolate, "device"))) {
        Local<Value> input = params->Get(String::NewFromUtf8(isolate, "device"));
        //if (!input->IsNumber()) {
        bag->device = stringValue(input);
    } else {
        bag->device = std::string("");
    }
    if (bag->verbose) {
        printf("camera :: opts { device : %s }\n", bag->device.c_str());
    }

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
    if (bag->verbose) {
        printf("camera :: opts { width : %d, height : %d }\n", bag->width, bag->height);
    }

    // accept opts { codec : string }
    if (params->Has(String::NewFromUtf8(isolate, "codec"))) {
        Local<String> val = params->Get(String::NewFromUtf8(isolate, "codec"))->ToString();
        bag->codec = stringValue(val);
    } else {
        bag->codec = std::string("");
    }
    if (bag->verbose) {
        printf("camera :: opts { codec : %s }\n", bag->codec.c_str());
    }

    // accept opts { faceDetect : boolean }
    if (params->Has(String::NewFromUtf8(isolate, "faceDetect"))) {
        bag->faceDetect = params->Get(String::NewFromUtf8(isolate, "faceDetect"))->BooleanValue();
    } else {
        bag->faceDetect = false;
    }
    if (bag->verbose) {
        printf("camera :: opts { faceDetect : %i }\n", bag->faceDetect);
    }

    // accept opts { threshold : double }
    if (params->Has(String::NewFromUtf8(isolate, "threshold"))) {
        bag->threshold = params->Get(String::NewFromUtf8(isolate, "threshold"))->NumberValue();
    } else {
        bag->threshold = CUTOFF_THRES;
    }
    if (bag->verbose) {
        printf("camera :: opts { threshold : %f }\n", bag->threshold);
    }

    // accept opts { threshold2 : double }
    if (params->Has(String::NewFromUtf8(isolate, "threshold2"))) {
        bag->threshold2 = params->Get(String::NewFromUtf8(isolate, "threshold2"))->NumberValue();
    } else {
        bag->threshold2 = 100;
    }
    if (bag->verbose) {
        printf("camera :: opts { threshold2 : %f }\n", bag->threshold2);
    }

    // accept opts { minFaceSize : integer }
    if (params->Has(String::NewFromUtf8(isolate, "minFaceSize"))) {
        bag->minFaceSize = params->Get(String::NewFromUtf8(isolate, "minFaceSize"))->NumberValue();
    } else {
        bag->minFaceSize = MIN_SIZE;
    }
    if (bag->verbose) {
        printf("camera :: opts { minFaceSize : %d }\n", bag->minFaceSize);
    }

    // accept opts { debugWindow : boolean }
    if (params->Has(String::NewFromUtf8(isolate, "debugWindow"))) {
        bag->debugWindow = params->Get(String::NewFromUtf8(isolate, "debugWindow"))->BooleanValue();
    } else {
        bag->debugWindow = false;
    }
    if (bag->verbose) {
        printf("camera :: opts { debugWindow : %i }\n", bag->debugWindow);
    }

    // accept opts { debugTimes : boolean }
    if (params->Has(String::NewFromUtf8(isolate, "debugTimes"))) {
        bag->debugTimes = params->Get(String::NewFromUtf8(isolate, "debugTimes"))->BooleanValue();
    } else {
        bag->debugTimes = false;
    }
    if (bag->verbose) {
        printf("camera :: opts { debugTimes : %i }\n", bag->debugTimes);
    }

    if (params->Has(String::NewFromUtf8(isolate, "frameCallback"))) {
        Local<Value> callback = params->Get(String::NewFromUtf8(isolate, "frameCallback"));
        if (!callback->IsFunction()) {
            isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "frameCallback must be a callback function")));
            return;
        } else {
            bag->callback.Reset(isolate, Handle<Function>::Cast(callback));
            if (bag->verbose) {
                printf("camera :: opts { frameCallback : true }\n");
            }
        }
    }

    if (bag->debugWindow) {
        cv::namedWindow("Preview", 1);
    }

    // Initiate OpenCV camera
    if (bag->verbose) {
        printf("camera :: starting opencv VideoCapture %s\n", bag->device.c_str());
    }

    bag->capture = new cv::VideoCapture();
    bool opened = false;
    if (input->IsNumber()) {
        opened = bag->capture->open((int) input->Int32Value());
    } else if (!bag->device.empty()) {
        opened = bag->capture->open(bag->device);
    }

    if (bag->verbose) {
        printf("camera :: VideoCapture opened %d\n", opened);
    }

    if (!opened) {
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "Error: Unable to open video capture")));
        return;
    }

    // https://stackoverflow.com/questions/27496698
    // This is only available since OpenCV 3.4
    // https://github.com/opencv/opencv/commit/d84d3a519b62d4c7e38a1f509b9bb4ce9abb18ce#diff-ffd98ce8cebb3ca8525b8f368cbdd8d1
    // bag->capture->set(CV_CAP_PROP_MODE, CV_CAP_MODE_YUYV);

    if (bag->verbose) {
        printf("camera :: starting async thread\n");
    }

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

    if (bag->debugWindow) {
        cv::destroyWindow("Preview");
    }

    if (bag->verbose) {
        printf("camera :: stopping thread\n");
    }

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

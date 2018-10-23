//
// Created by Fabio Cigliano on 02/07/18.
//

#include "thread.h"

/*
 * - send an snapshot
 */
void updateAsync(uv_async_t* req, int status) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);
    AsyncMessage* asyncMessage = (AsyncMessage*) req->data;

    if (asyncMessage->bag->debugWindow &&
            asyncMessage->frame.size().height > 0 &&
            asyncMessage->frame.size().width > 0) {
        cv::imshow("Preview", asyncMessage->frame);
        cv::waitKey(20);
    }

    Local<Array> arr = Array::New(isolate, asyncMessage->image.size());
    int pos = 0;
    for(unsigned char c : asyncMessage->image) {
        arr->Set(pos++, Integer::New(isolate, c));
    }

    // https://github.com/bellbind/node-v4l2camera/blob/master/v4l2camera.cc#L328
    Local<Value> argv[] = {
        Null(isolate),
        arr,
        Boolean::New(isolate, asyncMessage->faceDetected)
    };

    Local<Function> callBack = Local<Function>::New(isolate, bag->callback);
    callBack->Call(isolate->GetCurrentContext()->Global(), 3, argv);

    if (asyncMessage->bag->debugTimes) {
        if (time2frame > 0) { // log only the first time
            time2frame = getticks() - time2frame;
            printf("thread :: time to first frame %f\n", 1000.0f * time2frame);
            time2frame = -1;
        }
        if (time2face > 0 && asyncMessage->faceDetected) { // log only the first time
            time2face = getticks() - time2face;
            printf("thread :: time to first face %f\n", 1000.0f * time2face);
            time2face = -1;
        }
    }

    delete asyncMessage;
}

/*
 * - start camera capture
 * - retrieve image size
 * - send size message
 */
void cameraLoop(uv_work_t* req) {
    TMessage* message = (TMessage*) req->data;
    cv::Mat tmp, rsz;
    std::vector<cv::Mat> channels(3);
    float t = getticks();

    if (message->verbose) {
        printf("thread :: cameraLoop start\n");
    }

    /**
     * known problem.
     * some sloppy webcam drivers return an empty 1st frame, warmup or something.
     * just try to capture 1 frame, before you go into the idle loop
     * @see https://stackoverflow.com/questions/21353974
     */
    if (message->capture->isOpened()) {
        bag->capture->read(tmp);
    }

    while(m_brk > 0 && message->capture->isOpened()) {
        AsyncMessage *msg = new AsyncMessage();

        // Assign defaults
        msg->bag = message;
        msg->image = std::vector<unsigned char>();
        msg->faceDetected = false;

        // Capture Frame From WebCam
        message->capture->read(tmp);

        if (message->debugTimes) {
            time2process = getticks();
        }

        if (message->resize) {
            cv::Size size = cv::Size(message->width, message->height);
            cv::resize(tmp, rsz, size);
            msg->frame = rsz;

            tmp.release();
            tmp = rsz;
        } else {
            msg->frame = tmp;

            // Update Size
            message->width = tmp.size().width;
            message->height = tmp.size().height;
        }

        // Do face detect if needed
        if (message->faceDetect) {
            // https://github.com/opencv/opencv/issues/4356
            // Actually, YUV420 can be provide direct access to its grey-channel without any copying.
            // https://it.wikipedia.org/wiki/YUV
            split(tmp, channels);

            msg->faceDetected = detect(/* greyFrame */ channels[0], tmp, message);
        }

        // Encode to jpg
        if (message->codec.size()) {
            // TODO: Add image parameters here
            std::vector<int> compression_parameters = std::vector<int>(2);
            compression_parameters[0] = CV_IMWRITE_JPEG_QUALITY;
            compression_parameters[1] = 85;
            cv::imencode(message->codec, tmp, msg->image, compression_parameters);
            compression_parameters.clear();
        } else {
            msg->image = mat2vector(tmp);
        }

        async.data = msg;

        if (async.type != UV_UNKNOWN_HANDLE) {
            uv_async_send(&async);
        } else {
            delete msg;
        }

        if (message->debugTimes) {
            time2process = getticks() - time2process;
            printf("thread :: processing time %f\n", 1000.0f * time2process);
        }

    } // end cycle

    tmp.release();

    if (message->verbose) {
        t = getticks() - t;
        printf("thread :: cameraLoop end after %f\n", 1000.0f * t);
    }
}

/*
 * - stop camera capture
 */
void cameraClose(uv_work_t* req, int status) {
    Isolate* isolate = Isolate::GetCurrent();
    HandleScope scope(isolate);
    TMessage* message = (TMessage*) req->data;

    if (bag->verbose) {
        printf("thread :: cameraClose\n");
    }

    message->capture->release();
    delete message->capture;
    delete req;

    if (bag->verbose) {
        printf("thread :: cameraClose end\n");
    }
}

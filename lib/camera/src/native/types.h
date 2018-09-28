//
// Created by Fabio Cigliano on 02/07/18.
//

#ifndef CAMERA_WRAPPER_TYPES_H
#define CAMERA_WRAPPER_TYPES_H

// #define DEBUG_WINDOW
// #define DEBUG_MESSAGE
// #define DEBUG_TIMES

// Core
#include <iostream>
#include <fstream>
#include <stdio.h>
#include <cstdlib>
#include <ctime>

// Node.js deps
#include <node.h>
#include <v8.h>

// OpenCV deps
#include <opencv2/core/core.hpp>
#include <opencv2/imgproc/imgproc.hpp>
#include <opencv2/video/video.hpp>
#include <opencv2/highgui/highgui.hpp>

#include <uv.h>
#include <vector>

#ifndef FALSE
#define FALSE (0)
#endif

#ifndef TRUE
#define TRUE (!FALSE)
#endif

using namespace v8;

//Define functions in scope
std::string stringValue(Local<Value> value);
float getticks();
std::vector<uchar> mat2vector(cv::Mat mat);

/*
 * Thread message
 */
struct TMessage {
    // camera frame size
    int32_t width, height;

    bool resize;

    // frame encoding
    std::string codec;

    // facedetect enabled
    bool faceDetect;

    // facedetect face minSize (pixels)
    int32_t minsize;
    
    // facedetect quality threshold;
    float cutoff;

    // frame callback function
    Persistent<Function> callback;

    // OpenCV Camera capture
    cv::VideoCapture *capture;

    bool started;

    ~TMessage() {
        callback.Reset();
        delete capture;
    }
};

/**
 * Message sent to Node.js
 */
struct AsyncMessage {
    std::vector<unsigned char> image;
    cv::Mat frame;
    bool window;
    bool faceDetected;

    ~AsyncMessage() {
        image.clear();
        frame.release();
    }
};

extern int m_brk;
extern uv_async_t async;
extern TMessage *bag;

#ifdef DEBUG_TIMES
extern float time2process;
extern float time2frame;
extern float time2face;
#endif

#endif //CAMERA_WRAPPER_TYPES_H
//
// Created by Fabio Cigliano on 02/07/18.
//

#ifndef CAMERA_WRAPPER_TYPES_H
#define CAMERA_WRAPPER_TYPES_H

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
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/imgproc/imgproc.hpp>
#include <opencv2/video/video.hpp>

// OpenCV face deps
#include <opencv2/features2d/features2d.hpp>
#include <opencv2/objdetect/objdetect.hpp>

// Multi-thread
#include <uv.h>
#include <vector>

#ifndef MAX
#define MAX(x, y) x > y ? x : y
#endif

#ifndef FALSE
#define FALSE (0)
#endif

#ifndef TRUE
#define TRUE (!FALSE)
#endif

using namespace v8;

std::string stringValue(Local<Value> value);
float getticks();
std::vector<uchar> mat2vector(cv::Mat mat);

/*
 * Thread message
 */
struct TMessage {
    // Indicates whether or not the native process debugging messages are displayed
    bool verbose;

    // device - Camera device to open (example: 0, '/dev/video0')
    std::string device;

    // camera frame size
    int32_t width, height;
    bool resize;

    // frame encoding
    // Image format (only .jpg supported for now)
    std::string codec;

    // Indicates whether or not run the face detect algorithm
    bool faceDetect;

    // Face recognition quality threshold (higher means more accuracy) default: 6.5
    double threshold;

    // Face recognition quality threshold (higher means more accuracy) default: 6.5
    double threshold2;

    // Minimum face size (in pixel) default: 128
    int32_t minFaceSize;

    // Display the native OpenCV highgui window
    bool debugWindow;

    // Indicates whether or not the native processing times are displayed
    bool debugTimes;

    // frame callback function
    Persistent<Function> callback;

    // OpenCV Camera capture
    cv::VideoCapture *capture;

    bool started;

    float *rcsq;
    int ndetections;

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
    TMessage *bag;

    ~AsyncMessage() {
        image.clear();
        frame.release();
    }
};

extern int m_brk;
extern uv_async_t async;
extern TMessage *bag;

extern float time2process;
extern float time2frame;
extern float time2face;

#endif //CAMERA_WRAPPER_TYPES_H

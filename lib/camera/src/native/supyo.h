//
// Created by Fabio Cigliano on 02/07/18.
//

#ifndef CAMERA_WRAPPER_SUPYO_H
#define CAMERA_WRAPPER_SUPYO_H

#include <cstring>
#include "types.h"
#include "pico/picort.h"

/*
 * object detection parameters
 */

/**
 * how much to rescale the window during the multiscale detection process
 * increasing this value leads to lower number of detections and higher processing
 * speed for example, set to 1.2f if you're using pico on a mobile device
 */
#ifndef SCALEFACTOR
#define SCALEFACTOR 1.1f
#endif

/**
 * how much to move the window between neighboring detections increasing this
 * value leads to lower number of detections and higher processing speed
 * for example, set to 0.05f if you want really high recall
 */
#ifndef STRIDEFACTOR
#define STRIDEFACTOR 0.1f
#endif

/**
 * max number of detected objects
 */
#define MAXNDETECTIONS 2048

/**
 * how much to move the window between neighboring detections increasing this
 * value leads to lower number of detections and higher processing speed
 * for example, set to 0.05f if you want really high recall
 */
#ifndef STRIDEFACTOR
#define STRIDEFACTOR 0.1f
#endif

/**
 * face minimum size (in pixels) - suggested 128
 */
#ifndef MIN_SIZE
#define MIN_SIZE 128
#endif

/**
 * detection quality threshold (must be >= 0.0f)
 * you can vary the TPR and FPR with this value
 * if you're experiencing too many false positives
 * try a larger number here (for example, 7.5f)
 */
#ifndef CUTOFF_THRES
#define CUTOFF_THRES 0.5
#endif

bool detect(cv::Mat greyFrame);

#endif //CAMERA_WRAPPER_SUPYO_H

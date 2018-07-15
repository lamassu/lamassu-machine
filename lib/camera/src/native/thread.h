//
// Created by Fabio Cigliano on 02/07/18.
//

#ifndef CAMERA_WRAPPER_THREAD_H
#define CAMERA_WRAPPER_THREAD_H

#include "types.h"

void updateAsync(uv_async_t* req, int status);
void cameraLoop(uv_work_t* req);
void cameraClose(uv_work_t* req, int status);

#endif //CAMERA_WRAPPER_THREAD_H

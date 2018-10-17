
#include "supyo.h"

#ifndef MIN
#define MIN(a, b) ((a)<(b)?(a):(b))
#endif

float lastConfidence = 0.0f;

void debugRcsq(float *rcsq, int ndetections) {
    int i, x, y, r;
    float q;
    for (i = 0; i < ndetections; ++i) {
        x =   (int)rcsq[4*i+0];
        y =   (int)rcsq[4*i+1];
        r =   (int)rcsq[4*i+2];
        q = (float)rcsq[4*i+3];
        printf("[%d] (%d, %d) r=%d q=%f\n", i, x, y, r, q);
    }
}

/**
 * @param {cvFrame}  greyFrame - byte array of the greyscale image
 * @param {cvFrame}  colorFrame - byte array of the colored image
 * @param {boolean}  verbose - print debug messages to stdout
 * @param {TMessage} bag
 */
bool detect(cv::Mat greyFrame, cv::Mat colorFrame, TMessage* bag) {
  // image width
  int32_t ncols = greyFrame.cols;
  // image height
  int32_t nrows = greyFrame.rows;

  // perform detection with the pico library
  float t = getticks();

  int npixel = ncols * nrows;
  uint8_t pixels[npixel];
  std::memcpy(pixels, greyFrame.data, npixel * sizeof(uint8_t));

  // detection quality threshold (must be >= 0.0f)
  // you can vary the TPR and FPR with this value
  // if you're experiencing too many false positives
  // try a larger number here (for example, 7.5f)

//  if (bag->verbose) {
//    printf("supyo :: image %d x %d = %d pixes\n", ncols, nrows, npixel);
//  }

  int ndetections = 0, i;
  float orientation;
  float rcsq[4 * MAXNDETECTIONS * 2];
  bool detected = false;
  int x, y, r;
  float q;

  // work out the number width step
  /*int n_channels = greyFrame.width_step;
  int size_row_raw = ncols * n_channels;
  int rem = size_row_raw % 4;*/
  int width_step = greyFrame.step; //(rem == 0) ? size_row_raw : size_row_raw + rem;

//  if (bag->verbose) {
//    printf("supyo :: width_step %d\n", width_step);
//  }

  // a structure that encodes object appearance
  static unsigned char appfinder[] = {
    #include "pico/facefinder.ea"
  };

  for (i = 0; i < 4; i++) {
    // `orientation` is a number between 0 and 1 that determines the counterclockwise
    // in-plane rotation of the cascade: 0.0f corresponds to 0 radians
    // and 1.0f corresponds to 2*pi radians
    //orientation = i * 2 * 3.14f / 4;
    orientation = i / 4.f;

    ndetections += find_objects(rcsq,
      MAXNDETECTIONS - ndetections,
      appfinder,
      orientation,
      pixels,
      nrows, ncols, width_step,
      SCALEFACTOR, STRIDEFACTOR, bag->minFaceSize,
      MIN(nrows, ncols));

//    if (bag->verbose) {
//      printf("supyo :: orientation %f ndetections %d\n", orientation * 2 * 3.14f, ndetections);
//    }
  }

  // these are the faces detected on this image
  if (bag->verbose) {
      printf("supyo :: detected %d:\n", ndetections);
//      debugRcsq(rcsq, ndetections);
  }

  // these are the faces detected in a previous iteration
  if (bag->rcsq != NULL && ndetections > 0 && ndetections >= bag->ndetections) {
    if (bag->verbose) {
      printf("supyo :: restoring previous detections %d\n", bag->ndetections);
    }

    float *p = &rcsq[ndetections * 4];
    std::memcpy(p, bag->rcsq, bag->ndetections * 4 * sizeof(float));
    ndetections += bag->ndetections;

//    if (bag->verbose) {
//      printf("supyo :: after merge:\n");
//      debugRcsq(rcsq, ndetections);
//    }
  }

  // group them to identify duplicates
  ndetections = cluster_detections(rcsq, ndetections);
  if (bag->verbose) {
    printf("supyo :: cluster detections %d\n", ndetections);
    debugRcsq(rcsq, ndetections);
  }

  // store new detections that bypass the threshold
  if (bag->rcsq != NULL) {
    delete bag->rcsq;
  }
  bag->rcsq = new float[ndetections * 4];
  bag->ndetections = 0;

  for (i = 0; i < ndetections; ++i) {
    x =   (int)rcsq[4*i+0];
    y =   (int)rcsq[4*i+1];
    r =   (int)rcsq[4*i+2];
    q = (float)rcsq[4*i+3];

    // check the confidence threshold
    if (r <= 0) {
      continue;
    } else if (q >= bag->threshold2) {
      if (bag->verbose) {
        printf("supyo :: result %i face detected at (x=%d, y=%d, r=%d) confidence %f >= threshold2 (%f)\n",
            i, x, y, r, q,
            bag->threshold2);
      }

      if (bag->debugWindow) {
        cv::circle(colorFrame,
            cv::Point(y, x),
            r / 2,
            cv::Scalar(0, 255, 0));
      }

      lastConfidence = q;
      detected = true;

      // copy this result
      std::memcpy(bag->rcsq, &(rcsq[4*i+0]), 1 * 4 * sizeof(float));
      bag->ndetections++;

    } else if(q >= bag->threshold) {
      if (bag->verbose) {
        printf("supyo :: result %i face detected at (x=%d, y=%d, r=%d) confidence %f >= threshold (%f)\n",
            i, x, y, r, q,
            bag->threshold);
      }

      if (bag->debugWindow) {
        cv::circle(colorFrame,
            cv::Point(y, x),
            r / 2,
            cv::Scalar(255, 0, 0));
      }

      // copy this result
      std::memcpy(bag->rcsq, &(rcsq[4*i+0]), 1 * 4 * sizeof(float));
      bag->ndetections++;

    } else {
      /*if (bag->verbose) {
        printf("supyo :: result %i confidence %f < threshold (%f)\n", i, q, bag->threshold);
      }*/
    }
  }

//  if (bag->verbose && bag->ndetections > 0) {
//    printf("supyo :: stored detections %d\n", bag->ndetections);
//    debugRcsq(bag->rcsq, bag->ndetections);
//  }

  if (bag->debugWindow) {
    char buffer[50];
    sprintf(buffer, "confidence: %f", lastConfidence);
    cv::putText(colorFrame, buffer, cv::Point(30, 100), CV_FONT_HERSHEY_PLAIN, 2, cv::Scalar(0, 255, 0));
  }

  if (bag->debugTimes) {
    t = getticks() - t;
    printf("supyo :: time taken %f\n", 1000.0f * t);
  }

  return detected;
}

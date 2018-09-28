
#include "supyo.h"

#ifndef MIN
#define MIN(a, b) ((a)<(b)?(a):(b))
#endif

/**
 * @param {cvFrame}  greyFrame - byte array of the greyscale image
 * @param {boolean}  verbose - print debug messages to stdout
 */
bool detect(cv::Mat greyFrame) {
  // image width
  int32_t ncols = greyFrame.cols;
  // image height
  int32_t nrows = greyFrame.rows;

  int npixel = ncols * nrows;
  uint8_t pixels[npixel];
  std::memcpy(pixels, greyFrame.data, npixel * sizeof(uint8_t));

  // detection quality threshold (must be >= 0.0f)
 	// you can vary the TPR and FPR with this value
 	// if you're experiencing too many false positives
  // try a larger number here (for example, 7.5f)

#ifdef DEBUG_MESSAGE
  printf("supyo :: image %d x %d = %d pixes\n", ncols, nrows, npixel);
#endif

  int ndetections = 0, i;
  float orientation;
  float rcsq[4*MAXNDETECTIONS];
  bool detected = false;

  // work out the number width step
  /*int n_channels = greyFrame.width_step;
  int size_row_raw = ncols * n_channels;
  int rem = size_row_raw % 4;*/
  int width_step = greyFrame.step; //(rem == 0) ? size_row_raw : size_row_raw + rem;

#ifdef DEBUG_MESSAGE
    printf("supyo :: width_step %d\n", width_step);
#endif

#ifdef DEBUG_MESSAGE
	// perform detection with the pico library
	float t = getticks();
#endif

  // a structure that encodes object appearance
  static unsigned char appfinder[] = {
    #include "pico/facefinder.ea"
  };

  for (i = 1; i <= 4; i++) {
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
      SCALEFACTOR, STRIDEFACTOR, MIN_SIZE,
      MIN(nrows, ncols));

#ifdef DEBUG_MESSAGE
      printf("supyo :: orientation %f ndetections %d\n", orientation * 2 * 3.14f, ndetections);
#endif
  }

  ndetections = cluster_detections(rcsq, ndetections);
#ifdef DEBUG_MESSAGE
    printf("supyo :: cluster detections %d\n", ndetections);
#endif

  for (i = 0; i < ndetections; ++i) {
    // check the confidence threshold
    if(rcsq[4*i+3] >= CUTOFF_THRES) {
#ifdef DEBUG_MESSAGE
        printf("supyo :: face detected at (x=%d, y=%d, r=%d) confidence %f\n", (int)rcsq[4*i+0], (int)rcsq[4*i+1], (int)rcsq[4*i+2], rcsq[4*i+3]);
#endif

      detected = true;
      break;
    }
#ifdef DEBUG_MESSAGE
    else {
      printf("supyo :: result confidence %f < threshold (%f)\n", rcsq[4*i+3], CUTOFF_THRES);
    }
#endif
  }

#ifdef DEBUG_MESSAGE
    t = getticks() - t;
    printf("supyo :: time taken %f\n", 1000.0f * t);
#endif

  return detected;
}

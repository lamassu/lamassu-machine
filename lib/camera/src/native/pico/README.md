# Pixel Intensity Comparison-based Object detection (pico)

Those of you who would like to quickly see what this repository is all about, go to the folder **runtime/samples/C**.
There you will find a sample program which will detect faces in a video stream supplied from the default webcam attached to the computer.
Also, you can check out a demo video at <http://www.youtube.com/watch?v=1lXfm-PZz0Q>.

In general, detection can be described as a task of finding the positions and scales of all objects in an image that belong to a given appearance class.
For example, these objects could be cars, pedestrians or human faces.
Automatic object detection has a broad range of applications.
Some include biometrics, driver assistance, visual surveillance and smart human-machine interfaces.
These applications create a strong motivation for the development of fast and accurate object detection methods.

The **pico** framework is a modifcation of the standard Viola-Jones object detection method.
The basic idea is to scan the image with a cascade of binary classifers at all reasonable positions and scales.
An image region is classifed as an object of interest if it successfully passes all the members of the cascade.
Each binary classifier consists of an ensemble of decision trees with pixel intensity comparisons as binary tests in their internal nodes.
This enables the detector to process image regions at very high speed.
The details are given in <http://arxiv.org/abs/1305.4537>.

Some highlights of **pico** are:

* High processing speed.
* There is no need for image preprocessing prior to detection.
* There is no need for the computation of integral images, image pyramid, HOG pyramid or any other similar data structure.
* All binary tests in internal nodes of the trees are based on the same feature type (not the case in the V-J framework).
* The method can easily be modified for fast detection of in-plane rotated objects.

## Detecting objects in images and videos

The folder **runtime/** contains all the needed resources to perform object detection in images and video streams using pre-trained classification cascades.
Specifically, sample applications that performs face detection can be found in the folder **runtime/samples/**.

Note that the library also enables rotation invariant object detection.
This option is demonstrated by compiling the samples with a `_ROTATION_INVARIANT_DETECTION_` flag.

### Embedding pico runtime within your application

To use the runtime in your own application, you have to:

* Include a prototype for a function `find_objects(...)` in your code (for example, by adding `#include picort.h`)
* Include an encoded object detector of your choice (for example, `facefinder.ea`)
* Compile `picort.c` with your code
* Invoke `find_objects(...)` with appropriate parameters

Notice that there are no specific library dependencies, i.e., the code can be compiled out-of-the-box with a standard C compiler.

To get a feel for how the library works, we recommend that you look at `sample.c` as is was specifically written to be used as documentation.

## Learning custom object detectors

The program `picolrn.c` (available in the folder **learning/**) enables you to learn your own (custom) object detectors.
The training data has to be provided in a specific format.
The details are printed to the standard output when `picolrn` is invoked without parameters.
It is often convenient to pipe this information to a text file:

    $ ./picolrn > howto.txt

A tutorial that guides you through the process of learning a face detector can be found in the folder **learning/sample/**.

## Citation

If you use the provided code/binaries for your work, please cite the following paper:
> N. Markus, M. Frljak, I. S. Pandzic, J. Ahlberg and R. Forchheimer, "Object Detection with Pixel Intensity Comparisons Organized in Decision Trees", <http://arxiv.org/abs/1305.4537>

## Contact

For any additional information contact me at <neno.markus@gmail.com> or visit <http://public.tel.fer.hr/odet/>.

Copyright (c) 2013, Nenad Markus.
All rights reserved.

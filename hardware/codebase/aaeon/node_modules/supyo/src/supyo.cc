#include <node.h>
#include <v8.h>
#include <node_buffer.h>

// C standard library
#include <cstdlib>
#include <ctime>

#include "pico/picort.c"

using namespace v8;
using namespace node;

/*
  object detection parameters
*/

#ifndef SCALEFACTOR
#define SCALEFACTOR 1.2f
#endif

#ifndef STRIDEFACTOR
#define STRIDEFACTOR 0.1f
#endif

Handle<Value> Detect(const Arguments& args) {
  HandleScope scope;

  Local<Object> bufferObj = args[0]->ToObject();
  uint8_t* pixels = (uint8_t *)Buffer::Data(bufferObj);
//  size_t        npixels = Buffer::Length(bufferObj);

  int32_t ncols = args[1]->IntegerValue();
  int32_t nrows = args[2]->IntegerValue();
  int32_t minsize = args[3]->IntegerValue();
  float cutoff = (float)args[4]->NumberValue();

  #define MAXNDETECTIONS 2048
  int ndetections;
  float qs[MAXNDETECTIONS], rs[MAXNDETECTIONS],
    cs[MAXNDETECTIONS], ss[MAXNDETECTIONS];

  // a structure that encodes object appearance
  static unsigned char appfinder[] = {
    #include "pico/facefinder.ea"
  };

  // scan the image at 4 different orientations
  ndetections = 0;
  int min_dimension = nrows < ncols ? nrows : ncols;

  for (int i = 0; i < 4; ++i) {
    float orientation = i*2*3.14f/4;

    ndetections += find_objects(orientation, &rs[ndetections], &cs[ndetections],
      &ss[ndetections], &qs[ndetections], MAXNDETECTIONS-ndetections, appfinder,
      pixels, nrows, ncols, ncols, SCALEFACTOR, STRIDEFACTOR, minsize,
      min_dimension, 1);
  }

  int detected = 0;
  for (int i = 0; i < ndetections; ++i) {
    if(qs[i] >= cutoff) {
      detected = 1;
      break;
    }
  }

  return scope.Close(Boolean::New(detected));
}

void RegisterModule(Handle<Object> target) {

    // target is the module object you see when require()ing the .node file.
  target->Set(String::NewSymbol("detect"),
    FunctionTemplate::New(Detect)->GetFunction());
}

NODE_MODULE(supyo, RegisterModule);

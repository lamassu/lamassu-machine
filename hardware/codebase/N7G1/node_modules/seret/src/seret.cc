#include <node.h>
#include <v8.h>
#include <node_buffer.h>

// C standard library
#include <cstdlib>
#include <ctime>
#include <string.h>

#include "camera.h"

using namespace v8;
using namespace node;

Handle<Value> CameraOn(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 4) {
    return ThrowException(
      Exception::TypeError(String::New("cameraOn requires 4 arguments"))
    );
  }

  String::AsciiValue deviceString(args[0]->ToString());
  uint32_t width = args[1]->IntegerValue();
  uint32_t height = args[2]->IntegerValue();
  uint32_t fps = args[3]->IntegerValue();

  int fd = camera_on(*deviceString, width, height, fps);

  return scope.Close(Integer::New(fd));
}

Handle<Value> CameraOff(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 1) {
    return ThrowException(
      Exception::TypeError(String::New("cameraOff requires 1 argument"))
    );
  }

  int fd = args[0]->IntegerValue();

  camera_off(fd);

  return scope.Close(Null());
}

Handle<Value> StartCapture(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 1) {
    return ThrowException(
      Exception::TypeError(String::New("startCapture requires 1 argument"))
    );
  }

  int fd = args[0]->IntegerValue();

  int success = 0;
  do {
    success = (0 == start_capturing(fd));
    if (!success) stop_capturing(fd);
  } while (!success);

  return scope.Close(Null());
}

Handle<Value> StopCapture(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 1) {
    return ThrowException(
      Exception::TypeError(String::New("stopCapture requires 1 argument"))
    );
  }

  int fd = args[0]->IntegerValue();

  stop_capturing(fd);

  return scope.Close(Null());
}

Handle<Value> CaptureFrame(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 2) {
    return ThrowException(
      Exception::TypeError(String::New("captureFrame requires 2 arguments"))
    );
  }

  int fd = args[0]->IntegerValue();

  v8::Local<v8::Object> buffer = args[1]->ToObject();
  char* bufferData   = node::Buffer::Data(buffer);
  size_t bufferLength = node::Buffer::Length(buffer);
  int result = capture_frame(fd, bufferData, bufferLength);

  return scope.Close(Integer::New(result));
}

Handle<Value> ControlSet(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 3) {
    return ThrowException(
      Exception::TypeError(String::New("captureFrame requires 3 arguments"))
    );
  }

  int fd = args[0]->IntegerValue();
  uint32_t id = args[1]->Uint32Value();
  int32_t value = args[2]->Int32Value();

  control_set(fd, id, value);

  return scope.Close(Null());
}

void RegisterModule(Handle<Object> target) {

  // target is the module object you see when require()ing the .node file.
  target->Set(String::NewSymbol("cameraOn"),
    FunctionTemplate::New(CameraOn)->GetFunction());
  target->Set(String::NewSymbol("cameraOff"),
    FunctionTemplate::New(CameraOff)->GetFunction());
  target->Set(String::NewSymbol("startCapture"),
    FunctionTemplate::New(StartCapture)->GetFunction());
  target->Set(String::NewSymbol("stopCapture"),
    FunctionTemplate::New(StopCapture)->GetFunction());
  target->Set(String::NewSymbol("captureFrame"),
    FunctionTemplate::New(CaptureFrame)->GetFunction());
  target->Set(String::NewSymbol("controlSet"),
    FunctionTemplate::New(ControlSet)->GetFunction());
}

NODE_MODULE(seret, RegisterModule)

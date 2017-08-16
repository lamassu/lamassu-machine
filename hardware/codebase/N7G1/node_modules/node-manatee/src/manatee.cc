#include <nan.h>

// C standard library
#include <cstdlib>
#include <ctime>
#include <string.h>

#include "BarcodeScanner.h"

using namespace v8;
using namespace node;

NAN_METHOD(Scan) {
  if (info.Length() != 5) {
    return Nan::ThrowTypeError("scan requires 5 arguments");
  }

  if (!info[0]->IsObject() || !node::Buffer::HasInstance(info[0])) {
    return Nan::ThrowTypeError("First argument must be a buffer");
  }

  v8::Local<v8::Object> buffer = Nan::To<v8::Object>(info[0]).ToLocalChecked();
  uint8_t* pixels = (uint8_t *)Buffer::Data(buffer);
  size_t npixels = Buffer::Length(buffer);
  int32_t ncols = Nan::To<int32_t>(info[1]).FromJust();
  int32_t nrows = Nan::To<int32_t>(info[2]).FromJust();
  uint32_t codeMask = Nan::To<uint32_t>(info[3]).FromJust();
  int scanningLevel = Nan::To<int32_t>(info[4]).FromJust();

  if ((size_t)ncols * (size_t)nrows != npixels) {
    printf("npixels: %d\n", (int)npixels);
    printf("ncols: %d\n", (int)ncols);
    printf("nrows: %d\n", (int)nrows);
    return Nan::ThrowTypeError("Image dimensions don't match image");
  }

  if (MWB_setActiveCodes(codeMask) != MWB_RT_OK) {
    return Nan::ThrowTypeError("Couldn't set barcode types");
  }

  MWB_setDirection(MWB_SCANDIRECTION_HORIZONTAL|MWB_SCANDIRECTION_VERTICAL);
  MWB_setScanningRect(MWB_CODE_MASK_PDF, 0, 00, 100, 100);

  if (MWB_setLevel(scanningLevel) != MWB_RT_OK) {
    return Nan::ThrowTypeError("Couldn't set scanning level");
  }

  uint8_t *p_data = NULL;
  int retval = MWB_scanGrayscaleImage(pixels, ncols, nrows, &p_data);
  char msg[256];

  if (retval <= 0) {
    info.GetReturnValue().Set(Nan::Null());
    return;
  }

  Nan::MaybeLocal<v8::Object> outBuffer = Nan::NewBuffer((char *)p_data, retval);
  info.GetReturnValue().Set(outBuffer.ToLocalChecked());
}

NAN_METHOD(Register) {
  if (info.Length() != 3) {
    return Nan::ThrowTypeError("register requires 3 arguments");
  }

  uint32_t codeMask = Nan::To<uint32_t>(info[0]).FromJust();
  v8::Local<v8::String> userName = Nan::To<v8::String>(info[1]).ToLocalChecked();
  v8::Local<v8::String> key = Nan::To<v8::String>(info[2]).ToLocalChecked();

  int retval = MWB_registerCode(codeMask, *Nan::Utf8String(userName), *Nan::Utf8String(key));
  info.GetReturnValue().Set(Nan::New(retval));
}

NAN_METHOD(Version) {
  char versionString[256];
  unsigned int version = MWB_getLibVersion();
  sprintf(versionString, "%i.%i.%i", (version >> 16) & 0xff,
    (version >> 8) & 0xff, (version >> 0) & 0xff);
  info.GetReturnValue().Set(Nan::New(versionString).ToLocalChecked());
}

NAN_MODULE_INIT(InitAll) {
  Nan::SetMethod(target, "scan", Scan);
  Nan::SetMethod(target, "version", Version);
  Nan::SetMethod(target, "register", Register);
}

NODE_MODULE(manatee, InitAll);

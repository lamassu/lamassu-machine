#include "exports.h"
using namespace Nan;
using namespace v8;
using namespace node;

static char errStr[NJT_MSG_LENGTH_MAX] = "No error";
#define _throw(m) {snprintf(errStr, NJT_MSG_LENGTH_MAX, "%s", m); retval=-1; goto bailout;}

void compressBufferFreeCallback(char *data, void *hint) {
  tjFree((unsigned char*) data);
}

int compress(unsigned char* srcData, uint32_t format, uint32_t width, uint32_t stride, uint32_t height, uint32_t jpegSubsamp, int quality, unsigned long* jpegSize, unsigned char** dstData, uint32_t dstBufferLength) {
  int retval = 0;
  int err;

  tjhandle handle = NULL;
  int flags = TJFLAG_FASTDCT;
  int bpp = 0;
  uint32_t dstLength = 0;

  // Figure out bpp from format (needed to calculate output buffer size)
  switch (format) {
    case FORMAT_GRAY:
      bpp = 1;
      break;
    case FORMAT_RGB:
    case FORMAT_BGR:
      bpp = 3;
      break;
    case FORMAT_RGBX:
    case FORMAT_BGRX:
    case FORMAT_XRGB:
    case FORMAT_XBGR:
    case FORMAT_RGBA:
    case FORMAT_BGRA:
    case FORMAT_ABGR:
    case FORMAT_ARGB:
      bpp = 4;
      break;
    default:
      _throw("Invalid input format");
  }

  switch (jpegSubsamp) {
    case SAMP_444:
    case SAMP_422:
    case SAMP_420:
    case SAMP_GRAY:
    case SAMP_440:
      break;
    default:
      _throw("Invalid subsampling method");
  }

  // Set up buffers if required
  dstLength = tjBufSize(width, height, jpegSubsamp);
  if (dstBufferLength > 0) {
    if (dstLength > dstBufferLength) {
      _throw("Pontentially insufficient output buffer");
    }
    flags |= TJFLAG_NOREALLOC;
  }

  handle = tjInitCompress();
  if (handle == NULL) {
    _throw(tjGetErrorStr());
  }

  err = tjCompress2(handle, srcData, width, stride * bpp, height, format, dstData, jpegSize, jpegSubsamp, quality, flags);

  if (err != 0) {
    _throw(tjGetErrorStr());
  }

  bailout:
  if (handle != NULL) {
    err = 0;
    err = tjDestroy(handle);
    // If we already have an error retval wont be 0 so in that case we don't want to overwrite error message
    // Also cant use _throw here because infinite-loop
    if (err != 0 && retval == 0) {
      snprintf(errStr, NJT_MSG_LENGTH_MAX, "%s", tjGetErrorStr());
    }

    if (dstBufferLength > 0 && dstData != NULL) {
      tjFree(*dstData);
    }
  }

  return retval;
}

class CompressWorker : public AsyncWorker {
  public:
    CompressWorker(Callback *callback, unsigned char* srcData, uint32_t format, uint32_t width, uint32_t stride, uint32_t height, uint32_t jpegSubsamp, int quality, Local<Object> &dstObject, unsigned char* dstData, uint32_t dstBufferLength) :
      AsyncWorker(callback),
      srcData(srcData),
      format(format),
      width(width),
      stride(stride),
      height(height),
      jpegSubsamp(jpegSubsamp),
      quality(quality),
      jpegSize(0),
      dstData(dstData),
      dstBufferLength(dstBufferLength) {
        if (dstBufferLength > 0) {
          SaveToPersistent("dstObject", dstObject);
        }
      }
    ~CompressWorker() {}

    void Execute () {
      int err;

      err = compress(
          this->srcData,
          this->format,
          this->width,
          this->stride,
          this->height,
          this->jpegSubsamp,
          this->quality,
          &this->jpegSize,
          &this->dstData,
          this->dstBufferLength);

      if(err != 0) {
        SetErrorMessage(errStr);
      }
    }

    void HandleOKCallback () {
      Local<Object> obj = New<Object>();
      Local<Object> dstObject;

      if (this->dstBufferLength > 0) {
        dstObject = GetFromPersistent("dstObject").As<Object>();
      }
      else {
        dstObject = NewBuffer((char*)this->dstData, this->jpegSize, compressBufferFreeCallback, NULL).ToLocalChecked();
      }

      obj->Set(New("data").ToLocalChecked(), dstObject);
      obj->Set(New("size").ToLocalChecked(), New((uint32_t) this->jpegSize));

      v8::Local<v8::Value> argv[] = {
        Nan::Null(),
        obj
      };

      callback->Call(2, argv);
    }

  private:
    unsigned char* srcData;
    uint32_t format;
    uint32_t width;
    uint32_t stride;
    uint32_t height;
    uint32_t jpegSubsamp;
    int quality;
    unsigned long jpegSize;
    unsigned char* dstData;
    uint32_t dstBufferLength;
};

void compressParse(const Nan::FunctionCallbackInfo<Value>& info, bool async) {
  int retval = 0;
  int cursor = 0;

  // Input
  Callback *callback = NULL;
  Local<Object> srcObject;
  unsigned char* srcData = NULL;
  Local<Object> dstObject;
  uint32_t dstBufferLength = 0;
  unsigned char* dstData = NULL;
  Local<Object> options;
  Local<Value> formatObject;
  uint32_t format = 0;
  Local<Value> sampObject;
  uint32_t jpegSubsamp = NJT_DEFAULT_SUBSAMPLING;
  Local<Value> widthObject;
  uint32_t width = 0;
  Local<Value> heightObject;
  uint32_t height = 0;
  Local<Value> strideObject;
  uint32_t stride;
  Local<Value> qualityObject;
  int quality = NJT_DEFAULT_QUALITY;

  // Output
  unsigned long jpegSize = 0;

  // Try to find callback here, so if we want to throw something we can use callback's err
  if (async) {
    if (info[info.Length() - 1]->IsFunction()) {
      callback = new Callback(info[info.Length() - 1].As<Function>());
    }
    else {
      _throw("Missing callback");
    }
  }

  if ((async && info.Length() < 3) || (!async && info.Length() < 2)) {
    _throw("Too few arguments");
  }

  // Input buffer
  srcObject = info[cursor++].As<Object>();
  if (!Buffer::HasInstance(srcObject)) {
    _throw("Invalid source buffer");
  }
  srcData = (unsigned char*) Buffer::Data(srcObject);

  // Options
  options = info[cursor++].As<Object>();

  // Check if options we just got is actually the destination buffer
  // If it is, pull new object from info and set that as options
  if (Buffer::HasInstance(options) && info.Length() > cursor) {
    dstObject = options;
    options = info[cursor++].As<Object>();
    dstBufferLength = Buffer::Length(dstObject);
    dstData = (unsigned char*) Buffer::Data(dstObject);
  }

  if (!options->IsObject()) {
    _throw("Options must be an object");
  }

  // Format of input buffer
  formatObject = options->Get(New("format").ToLocalChecked());
  if (formatObject->IsUndefined()) {
    _throw("Missing format");
  }
  if (!formatObject->IsUint32()) {
    _throw("Invalid input format");
  }
  format = formatObject->Uint32Value();

  // Subsampling
  sampObject = options->Get(New("subsampling").ToLocalChecked());
  if (!sampObject->IsUndefined()) {
    if (!sampObject->IsUint32()) {
      _throw("Invalid subsampling method");
    }
    jpegSubsamp = sampObject->Uint32Value();
  }

  // Width
  widthObject = options->Get(New("width").ToLocalChecked());
  if (widthObject->IsUndefined()) {
    _throw("Missing width");
  }
  if (!widthObject->IsUint32()) {
    _throw("Invalid width value");
  }
  width = widthObject->Uint32Value();

  // Height
  heightObject = options->Get(New("height").ToLocalChecked());
  if (heightObject->IsUndefined()) {
    _throw("Missing height");
  }
  if (!heightObject->IsUint32()) {
    _throw("Invalid height value");
  }
  height = heightObject->Uint32Value();

  // Stride
  strideObject = options->Get(New("stride").ToLocalChecked());
  if (!strideObject->IsUndefined()) {
    if (!strideObject->IsUint32()) {
      _throw("Invalid stride value");
    }
    stride = strideObject->Uint32Value();
  }
  else {
    stride = width;
  }

  // Quality
  qualityObject = options->Get(New("quality").ToLocalChecked());
  if (!qualityObject->IsUndefined()) {
    if (!qualityObject->IsUint32() || qualityObject->Uint32Value() > 100) {
      _throw("Invalid quality value");
    }
    quality = qualityObject->Uint32Value();
  }

  // Do either async or sync compress
  if (async) {
    AsyncQueueWorker(new CompressWorker(callback, srcData, format, width, stride, height, jpegSubsamp, quality, dstObject, dstData, dstBufferLength));
    return;
  }
  else {
    retval = compress(
        srcData,
        format,
        width,
        stride,
        height,
        jpegSubsamp,
        quality,
        &jpegSize,
        &dstData,
        dstBufferLength);

    if(retval != 0) {
      // Compress will set the errStr
      goto bailout;
    }
    Local<Object> obj = New<Object>();
    if (dstBufferLength == 0) {
      dstObject = NewBuffer((char*)dstData, jpegSize, compressBufferFreeCallback, NULL).ToLocalChecked();
    }

    obj->Set(New("data").ToLocalChecked(), dstObject);
    obj->Set(New("size").ToLocalChecked(), New((uint32_t) jpegSize));
    info.GetReturnValue().Set(obj);
    return;
  }

  // If we have error throw error or call callback with error
  bailout:
  if (retval != 0) {
    if (NULL == callback) {
      ThrowError(TypeError(errStr));
    }
    else {
      Local<Value> argv[] = {
        New(errStr).ToLocalChecked()
      };
      callback->Call(1, argv);
    }
    return;
  }
}

NAN_METHOD(CompressSync) {
  compressParse(info, false);
}

NAN_METHOD(Compress) {
  compressParse(info, true);
}


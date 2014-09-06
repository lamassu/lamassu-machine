#include <node.h>
#include <node_buffer.h>
#include <jpeglib.h>
#include <cstdlib>
#include <cstring>

#include "common.h"
#include "fixed_jpeg_stack.h"
#include "jpeg_encoder.h"
#include "buffer_compat.h"

using namespace v8;
using namespace node;

void
FixedJpegStack::Initialize(v8::Handle<v8::Object> target)
{
    HandleScope scope;

    Local<FunctionTemplate> t = FunctionTemplate::New(New);
    t->InstanceTemplate()->SetInternalFieldCount(1);
    NODE_SET_PROTOTYPE_METHOD(t, "encode", JpegEncodeAsync);
    NODE_SET_PROTOTYPE_METHOD(t, "encodeSync", JpegEncodeSync);
    NODE_SET_PROTOTYPE_METHOD(t, "push", Push);
    NODE_SET_PROTOTYPE_METHOD(t, "setQuality", SetQuality);
    target->Set(String::NewSymbol("FixedJpegStack"), t->GetFunction());
}

FixedJpegStack::FixedJpegStack(int wwidth, int hheight, buffer_type bbuf_type) :
    width(wwidth), height(hheight), quality(60), buf_type(bbuf_type)
{
    data = (unsigned char *)calloc(width*height*3, sizeof(*data));
    if (!data) throw "calloc in FixedJpegStack::FixedJpegStack failed!";
}

Handle<Value>
FixedJpegStack::JpegEncodeSync()
{
    HandleScope scope;

    try {
        JpegEncoder jpeg_encoder(data, width, height, quality, BUF_RGB);
        jpeg_encoder.encode();
        int jpeg_len = jpeg_encoder.get_jpeg_len();
        Buffer *retbuf = Buffer::New(jpeg_len);
        memcpy(Buffer::Data(retbuf), jpeg_encoder.get_jpeg(), jpeg_len);
        return scope.Close(retbuf->handle_); 
    }
    catch (const char *err) {
        return VException(err);
    }
}

void
FixedJpegStack::Push(unsigned char *data_buf, int x, int y, int w, int h)
{
    int start = y*width*3 + x*3;

    switch (buf_type) {
    case BUF_RGB:
        for (int i = 0; i < h; i++) {
            unsigned char *datap = &data[start + i*width*3];
            for (int j = 0; j < w; j++) {
                *datap++ = *data_buf++;
                *datap++ = *data_buf++;
                *datap++ = *data_buf++;
            }
        }
        break;

    case BUF_BGR:
        for (int i = 0; i < h; i++) {
            unsigned char *datap = &data[start + i*width*3];
            for (int j = 0; j < w; j++) {
                *datap++ = *(data_buf+2);
                *datap++ = *(data_buf+1);
                *datap++ = *data_buf;
                data_buf+=3;
            }
        }
        break;

    case BUF_RGBA:
        for (int i = 0; i < h; i++) {
            unsigned char *datap = &data[start + i*width*3];
            for (int j = 0; j < w; j++) {
                *datap++ = *data_buf++;
                *datap++ = *data_buf++;
                *datap++ = *data_buf++;
                data_buf++;
            }
        }
        break;

    case BUF_BGRA:
        for (int i = 0; i < h; i++) {
            unsigned char *datap = &data[start + i*width*3];
            for (int j = 0; j < w; j++) {
                *datap++ = *(data_buf+2);
                *datap++ = *(data_buf+1);
                *datap++ = *data_buf;
                data_buf += 4;
            }
        }
        break;

    default:
        throw "Unexpected buf_type in FixedJpegStack::Push";
    }
}


void
FixedJpegStack::SetQuality(int q)
{
    quality = q;
}

Handle<Value>
FixedJpegStack::New(const Arguments &args)
{
    HandleScope scope;

    if (args.Length() < 2)
        return VException("At least two arguments required - width, height, [and buffer type]");
    if (!args[0]->IsInt32())
        return VException("First argument must be integer width.");
    if (!args[1]->IsInt32())
        return VException("Second argument must be integer height.");

    int w = args[0]->Int32Value();
    int h = args[1]->Int32Value();

    if (w < 0)
        return VException("Width can't be negative.");
    if (h < 0)
        return VException("Height can't be negative.");

    buffer_type buf_type = BUF_RGB;
    if (args.Length() == 3) {
        if (!args[2]->IsString())
            return VException("Third argument must be a string. Either 'rgb', 'bgr', 'rgba' or 'bgra'.");

        String::AsciiValue bt(args[2]->ToString());
        if (!(str_eq(*bt, "rgb") || str_eq(*bt, "bgr") ||
            str_eq(*bt, "rgba") || str_eq(*bt, "bgra")))
        {
            return VException("Buffer type must be 'rgb', 'bgr', 'rgba' or 'bgra'.");
        }

        if (str_eq(*bt, "rgb"))
            buf_type = BUF_RGB;
        else if (str_eq(*bt, "bgr"))
            buf_type = BUF_BGR;
        else if (str_eq(*bt, "rgba"))
            buf_type = BUF_RGBA;
        else if (str_eq(*bt, "bgra"))
            buf_type = BUF_BGRA;
        else 
            return VException("Buffer type wasn't 'rgb', 'bgr', 'rgba' or 'bgra'.");
    }

    try {
        FixedJpegStack *jpeg = new FixedJpegStack(w, h, buf_type);
        jpeg->Wrap(args.This());
        return args.This();
    }
    catch (const char *err) {
        return VException(err);
    }
}

Handle<Value>
FixedJpegStack::JpegEncodeSync(const Arguments &args)
{
    HandleScope scope;
    FixedJpegStack *jpeg = ObjectWrap::Unwrap<FixedJpegStack>(args.This());
    return scope.Close(jpeg->JpegEncodeSync());
}

Handle<Value>
FixedJpegStack::Push(const Arguments &args)
{
    HandleScope scope;

    if (!Buffer::HasInstance(args[0]))
        return VException("First argument must be Buffer.");
    if (!args[1]->IsInt32())
        return VException("Second argument must be integer x.");
    if (!args[2]->IsInt32())
        return VException("Third argument must be integer y.");
    if (!args[3]->IsInt32())
        return VException("Fourth argument must be integer w.");
    if (!args[4]->IsInt32())
        return VException("Fifth argument must be integer h.");

    FixedJpegStack *jpeg = ObjectWrap::Unwrap<FixedJpegStack>(args.This());
    Local<Object> data_buf = args[0]->ToObject();
    int x = args[1]->Int32Value();
    int y = args[2]->Int32Value();
    int w = args[3]->Int32Value();
    int h = args[4]->Int32Value();

    if (x < 0)
        return VException("Coordinate x smaller than 0.");
    if (y < 0)
        return VException("Coordinate y smaller than 0.");
    if (w < 0)
        return VException("Width smaller than 0.");
    if (h < 0)
        return VException("Height smaller than 0.");
    if (x >= jpeg->width) 
        return VException("Coordinate x exceeds FixedJpegStack's dimensions.");
    if (y >= jpeg->height) 
        return VException("Coordinate y exceeds FixedJpegStack's dimensions.");
    if (x+w > jpeg->width) 
        return VException("Pushed fragment exceeds FixedJpegStack's width.");
    if (y+h > jpeg->height) 
        return VException("Pushed fragment exceeds FixedJpegStack's height.");

    jpeg->Push((unsigned char *)Buffer::Data(data_buf), x, y, w, h);

    return Undefined();
}

Handle<Value>
FixedJpegStack::SetQuality(const Arguments &args)
{
    HandleScope scope;

    if (args.Length() != 1)
        return VException("One argument required - quality");

    if (!args[0]->IsInt32())
        return VException("First argument must be integer quality");

    int q = args[0]->Int32Value();

    if (q < 0) 
        return VException("Quality must be greater or equal to 0.");
    if (q > 100)
        return VException("Quality must be less than or equal to 100.");

    FixedJpegStack *jpeg = ObjectWrap::Unwrap<FixedJpegStack>(args.This());
    jpeg->SetQuality(q);

    return Undefined();
}

void
FixedJpegStack::UV_JpegEncode(uv_work_t *req)
{
    encode_request *enc_req = (encode_request *)req->data;
    FixedJpegStack *jpeg = (FixedJpegStack *)enc_req->jpeg_obj;

    try {
        JpegEncoder encoder(jpeg->data, jpeg->width, jpeg->height, jpeg->quality, BUF_RGB);
        encoder.encode();
        enc_req->jpeg_len = encoder.get_jpeg_len();
        enc_req->jpeg = (char *)malloc(sizeof(*enc_req->jpeg)*enc_req->jpeg_len);
        if (!enc_req->jpeg) {
            enc_req->error = strdup("malloc in FixedJpegStack::UV_JpegEncode failed.");
            return;
        }
        else {
            memcpy(enc_req->jpeg, encoder.get_jpeg(), enc_req->jpeg_len);
        }
    }
    catch (const char *err) {
        enc_req->error = strdup(err);
    }
}

void 
FixedJpegStack::UV_JpegEncodeAfter(uv_work_t *req)
{
    HandleScope scope;

    encode_request *enc_req = (encode_request *)req->data;
    delete req;

    Handle<Value> argv[2];

    if (enc_req->error) {
        argv[0] = Undefined();
        argv[1] = ErrorException(enc_req->error);
    }
    else {
        Buffer *buf = Buffer::New(enc_req->jpeg_len);
        memcpy(Buffer::Data(buf), enc_req->jpeg, enc_req->jpeg_len);
        argv[0] = buf->handle_;
        argv[1] = Undefined();
    }

    TryCatch try_catch; // don't quite see the necessity of this

    enc_req->callback->Call(Context::GetCurrent()->Global(), 2, argv);

    if (try_catch.HasCaught())
        FatalException(try_catch);

    enc_req->callback.Dispose();
    free(enc_req->jpeg);
    free(enc_req->error);

    ((FixedJpegStack *)enc_req->jpeg_obj)->Unref();
    free(enc_req);
}

Handle<Value>
FixedJpegStack::JpegEncodeAsync(const Arguments &args)
{
    HandleScope scope;

    if (args.Length() != 1)
        return VException("One argument required - callback function.");

    if (!args[0]->IsFunction())
        return VException("First argument must be a function.");

    Local<Function> callback = Local<Function>::Cast(args[0]);
    FixedJpegStack *jpeg = ObjectWrap::Unwrap<FixedJpegStack>(args.This());

    encode_request *enc_req = (encode_request *)malloc(sizeof(*enc_req));
    if (!enc_req)
        return VException("malloc in FixedJpegStack::JpegEncodeAsync failed.");

    enc_req->callback = Persistent<Function>::New(callback);
    enc_req->jpeg_obj = jpeg;
    enc_req->jpeg = NULL;
    enc_req->jpeg_len = 0;
    enc_req->error = NULL;

    uv_work_t* req = new uv_work_t;
    req->data = enc_req;
    uv_queue_work(uv_default_loop(), req, UV_JpegEncode, (uv_after_work_cb)UV_JpegEncodeAfter);
    jpeg->Ref();

    return Undefined();
}


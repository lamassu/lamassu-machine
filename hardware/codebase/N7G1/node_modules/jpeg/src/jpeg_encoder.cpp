#include "jpeg_encoder.h"

JpegEncoder::JpegEncoder(unsigned char *ddata, int wwidth, int hheight,
    int qquality, buffer_type bbuf_type)
    :
      data(ddata), width(wwidth), height(hheight), quality(qquality), smoothing(0),
    buf_type(bbuf_type),
    jpeg(NULL), jpeg_len(0),
    offset(0, 0, 0, 0) {}

JpegEncoder::~JpegEncoder() {
    free(jpeg);
}

#if JPEG_LIB_VERSION < 80
// copied over from latest libjpeg

#define OUTPUT_BUF_SIZE 4096

typedef struct {
  struct jpeg_destination_mgr pub; /* public fields */

  unsigned char ** outbuffer;	/* target buffer */
  unsigned long * outsize;
  unsigned char * newbuffer;	/* newly allocated buffer */
  JOCTET * buffer;		/* start of buffer */
  size_t bufsize;
} my_mem_destination_mgr;

typedef my_mem_destination_mgr * my_mem_dest_ptr;

void
init_mem_destination (j_compress_ptr cinfo)
{
  /* no work necessary here */
}

boolean
empty_mem_output_buffer (j_compress_ptr cinfo)
{
  size_t nextsize;
  JOCTET * nextbuffer;
  my_mem_dest_ptr dest = (my_mem_dest_ptr) cinfo->dest;

  /* Try to allocate new buffer with double size */
  nextsize = dest->bufsize * 2;
  nextbuffer = (JOCTET *)malloc(nextsize);

  if (nextbuffer == NULL)
    throw "malloc failed in empty_mem_output_buffer";

  memcpy(nextbuffer, dest->buffer, dest->bufsize);

  if (dest->newbuffer != NULL)
    free(dest->newbuffer);

  dest->newbuffer = nextbuffer;

  dest->pub.next_output_byte = nextbuffer + dest->bufsize;
  dest->pub.free_in_buffer = dest->bufsize;

  dest->buffer = nextbuffer;
  dest->bufsize = nextsize;

  return TRUE;
}

void
term_mem_destination (j_compress_ptr cinfo)
{
  my_mem_dest_ptr dest = (my_mem_dest_ptr) cinfo->dest;

  *dest->outbuffer = dest->buffer;
  *dest->outsize = dest->bufsize - dest->pub.free_in_buffer;
}

void
jpeg_mem_dest (j_compress_ptr cinfo,
	       unsigned char ** outbuffer, unsigned long * outsize)
{
  my_mem_dest_ptr dest;

  /* The destination object is made permanent so that multiple JPEG images
   * can be written to the same buffer without re-executing jpeg_mem_dest.
   */
  if (cinfo->dest == NULL) {	/* first time for this JPEG object? */
    cinfo->dest = (struct jpeg_destination_mgr *)
      (*cinfo->mem->alloc_small) ((j_common_ptr) cinfo, JPOOL_PERMANENT,
				  sizeof(my_mem_destination_mgr));
  }

  dest = (my_mem_dest_ptr) cinfo->dest;
  dest->pub.init_destination = init_mem_destination;
  dest->pub.empty_output_buffer = empty_mem_output_buffer;
  dest->pub.term_destination = term_mem_destination;
  dest->outbuffer = outbuffer;
  dest->outsize = outsize;
  dest->newbuffer = NULL;

  if (*outbuffer == NULL || *outsize == 0) {
    /* Allocate initial buffer */
    dest->newbuffer = *outbuffer = (unsigned char *)malloc(OUTPUT_BUF_SIZE);
    if (dest->newbuffer == NULL)
      throw "out of memory in jpeg_mem_dest (copied implementation)";
    *outsize = OUTPUT_BUF_SIZE;
  }

  dest->pub.next_output_byte = dest->buffer = *outbuffer;
  dest->pub.free_in_buffer = dest->bufsize = *outsize;
}
#endif

void
JpegEncoder::encode()
{
    struct jpeg_compress_struct cinfo;
    struct jpeg_error_mgr jerr;

    cinfo.err = jpeg_std_error(&jerr);

    jpeg_create_compress(&cinfo);
    jpeg_mem_dest(&cinfo, &jpeg, &jpeg_len);

    if (offset.isNull()) {
        cinfo.image_width = width;
        cinfo.image_height = height;
    }
    else {
        cinfo.image_width = offset.w;
        cinfo.image_height = offset.h;
    }
    cinfo.input_components = 3;
    cinfo.in_color_space = JCS_RGB;

    jpeg_set_defaults(&cinfo);
    jpeg_set_quality(&cinfo, quality, TRUE);
    cinfo.smoothing_factor = smoothing;
    jpeg_start_compress(&cinfo, TRUE);

    unsigned char *rgb_data;
    switch (buf_type) {
    case BUF_RGBA:
        rgb_data = rgba_to_rgb(data, width*height*4);
        if (!rgb_data) throw "malloc failed in JpegEncoder::encode/rgba_to_rgb.";
        break;

    case BUF_BGRA:
        rgb_data = bgra_to_rgb(data, width*height*4);
        if (!rgb_data) throw "malloc failed in JpegEncoder::encode/bgra_to_rgb.";
        break;

    case BUF_BGR:
        rgb_data = bgr_to_rgb(data, width*height*3);
        if (!rgb_data) throw "malloc failed in JpegEncoder::encode/bgr_to_rgb.";
        break;

    case BUF_RGB:
        rgb_data = data;
        break;

    default:
        throw "Unexpected buf_type in JpegEncoder::encode";
    }

    JSAMPROW row_pointer;
    int start = 0;
    if (!offset.isNull()) {
        start = offset.y*width*3 + offset.x*3;
    }
    while (cinfo.next_scanline < cinfo.image_height) {
        row_pointer = &rgb_data[start + cinfo.next_scanline*3*width];
        jpeg_write_scanlines(&cinfo, &row_pointer, 1);
    }

    jpeg_finish_compress(&cinfo);
    jpeg_destroy_compress(&cinfo);

    if (buf_type == BUF_BGR || buf_type == BUF_RGBA || buf_type == BUF_BGRA)
        free(rgb_data);
}

void
JpegEncoder::set_quality(int q)
{
    quality = q;
}

void JpegEncoder::set_smoothing(int ssmoothing)
{
    smoothing  = ssmoothing;
}

const unsigned char *
JpegEncoder::get_jpeg() const
{
    return jpeg;
}

unsigned int
JpegEncoder::get_jpeg_len() const
{
    return jpeg_len;
}

void
JpegEncoder::setRect(const Rect &r)
{
    offset = r;
}


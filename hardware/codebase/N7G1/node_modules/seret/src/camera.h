extern "C" {
  int camera_on(char *dev_name, uint32_t width, uint32_t height, uint32_t fps);
  void camera_off(int fd);
  int start_capturing(int fd);
  void stop_capturing(int fd);
  int capture_frame(int fd, char *result_buf, size_t result_size);
  void control_set(int fd, uint32_t id, int32_t value);
}

import Options
from os import unlink, symlink, popen
from os.path import exists 

srcdir = "."
blddir = "build"
VERSION = "0.0.1"

def set_options(opt):
  opt.tool_options("compiler_cxx")

def configure(conf):
  conf.check_tool("compiler_cxx")
  conf.check_tool("node_addon")
  conf.check(lib='jpeg', libpath=['/lib', '/usr/lib', '/usr/local/lib', '/usr/local/libjpeg/lib', '/usr/local/pkg/jpeg-8b/lib'])

def build(bld):
  obj = bld.new_task_gen("cxx", "shlib", "node_addon")
  obj.target = "jpeg"
  obj.source = "src/common.cpp src/jpeg_encoder.cpp src/jpeg.cpp src/fixed_jpeg_stack.cpp src/dynamic_jpeg_stack.cpp src/module.cpp"
  obj.uselib = "JPEG"
  obj.cxxflags = ["-D_FILE_OFFSET_BITS=64", "-D_LARGEFILE_SOURCE"]

def shutdown():
  if Options.commands['clean']:
    if exists('jpeg.node'): unlink('jpeg.node')
  else:
    if exists('build/default/jpeg.node') and not exists('jpeg.node'):
      symlink('build/default/jpeg.node', 'jpeg.node')


{
  'targets': [
    {
      'target_name': 'jpegturbo',
      'dependencies': [
        'deps/libjpeg-turbo.gyp:jpeg-turbo'
      ],
      'sources': [
        'src/buffersize.cc',
        'src/compress.cc',
        'src/decompress.cc',
        'src/exports.cc',
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")'
      ],
      'conditions': [
        ['OS=="mac"', {
          'xcode_settings': {
            'MACOSX_DEPLOYMENT_TARGET': '10.9'
          }
        }]
      ]
    }
  ]
}

/**
 * @file    BarcodeScanner.h
 * @brief   Barcode Decoders Library
 * @n       (C) Manatee Works, 2011-2012.
 *
 *          Main user public header.
 */

#ifndef _BARCODESCANNER_H_
#define _BARCODESCANNER_H_

#ifdef __cplusplus
extern "C" {
#endif

#ifndef uint32_t
#define uint32_t unsigned int
#define uint8_t unsigned char
#endif


/**
 * @name General configuration
 ** @{
 */

/** @name Grayscale image size range
 ** @{ */
#define MWB_GRAYSCALE_LENX_MIN      10
#define MWB_GRAYSCALE_LENX_MAX      3000
#define MWB_GRAYSCALE_LENY_MIN      10
#define MWB_GRAYSCALE_LENY_MAX      3000
/** @} */

/**
 * @name Basic return values for API functions
 * @{
 */
#define MWB_RT_OK                   0
#define MWB_RT_FAIL                 -1
#define MWB_RT_NOT_SUPPORTED        -2
#define MWB_RT_BAD_PARAM            -3
/** @} */

/**
 ** @name    Configuration values for use with MWB_setFlags
 ** @{ */
    
    
/** @brief  Global decoder flags value: apply sharpening on input image
 */
#define  MWB_CFG_GLOBAL_HORIZONTAL_SHARPENING           0x01
#define  MWB_CFG_GLOBAL_VERTICAL_SHARPENING             0x02
#define  MWB_CFG_GLOBAL_SHARPENING                      0x03
    

/** @brief  Global decoder flags value: apply rotation on input image
 */
#define  MWB_CFG_GLOBAL_ROTATE90                        0x04
    
 
/** @brief  Code39 decoder flags value: select VIN mode
 */
#define  MWB_CFG_CODE39_VIN_MODE           0x1

/** @brief  Code39 decoder flags value: require checksum check
 */
#define  MWB_CFG_CODE39_REQ_CHKSUM         0x2
/**/
    
    
/** @brief  Code25 decoder flags value: require checksum check
 */
#define  MWB_CFG_CODE25_REQ_CHKSUM         0x1
/**/
    

/**
 * @brief   Datamatrix decoder flag value: select VIN mode
 */
#define  MWB_CFG_DM_VIN_MODE               0x1

/**
 * @brief   Code 128 decoder flag value: select VIN mode
 */
#define  MWB_CFG_CODE128_VIN_MODE               0x1

/** @} */

/**
 * @name Bit mask identifiers for supported decoder types
 * @{ */
#define MWB_CODE_MASK_NONE                  0x00000000u
#define MWB_CODE_MASK_QR                    0x00000001u
#define MWB_CODE_MASK_DM                    0x00000002u
#define MWB_CODE_MASK_RSS                   0x00000004u
#define MWB_CODE_MASK_39                    0x00000008u
#define MWB_CODE_MASK_EANUPC                0x00000010u
#define MWB_CODE_MASK_128                   0x00000020u
#define MWB_CODE_MASK_PDF                   0x00000040u
#define MWB_CODE_MASK_AZTEC                 0x00000080u
#define MWB_CODE_MASK_25                    0x00000100u
#define MWB_CODE_MASK_ALL                   0xffffffffu
/** @} */

/**
 * @name Bit mask identifiers for RSS decoder types
 * @{ */
#define MWB_SUBC_MASK_RSS_14            0x00000001u
#define MWB_SUBC_MASK_RSS_LIM           0x00000004u
#define MWB_SUBC_MASK_RSS_EXP           0x00000008u
/** @} */
    
/**
 * @name Bit mask identifiers for 2 of 5 decoder types
 * @{ */
#define MWB_SUBC_MASK_C25_INTERLEAVED   0x00000001u
#define MWB_SUBC_MASK_C25_STANDARD      0x00000002u
/** @} */

/**
 * @name Bit mask identifiers for 1D scanning direction 
 * @{ */
#define MWB_SCANDIRECTION_HORIZONTAL    0x00000001u
#define MWB_SCANDIRECTION_VERTICAL      0x00000002u
#define MWB_SCANDIRECTION_OMNI          0x00000004u
#define MWB_SCANDIRECTION_AUTODETECT    0x00000008u
/** @} */

/**
 * @name Result values for all code types
 * @{ */
enum res_types {
    FOUND_NONE = 0,
    FOUND_DM,
    FOUND_39,
    FOUND_RSS_14,
    FOUND_RSS_14_STACK,
    FOUND_RSS_LIM,
    FOUND_RSS_EXP,
    FOUND_EAN_13,
    FOUND_EAN_8,
    FOUND_UPC_A,
    FOUND_UPC_E,
    FOUND_128,
    FOUND_PDF,
    FOUND_QR,
    FOUND_AZTEC,
    FOUND_25_INTERLEAVED,
    FOUND_25_STANDARD
};
/** @} */

/**
 * @name User API function headers 
 * @{ */

/**
 * Returns version code of Barcode Scanner Library.
 *
 * @return  32-bit version code in x.y.z format.
 * @n       Byte 3 (most significant byte):     reserved (0)
 * @n       Byte 2:                             value x
 * @n       Byte 1:                             value y
 * @n       Byte 0 (least significant byte):    value z
 */
extern unsigned int MWB_getLibVersion(void);

/**
 * Returns supported decoders in this library release.
 *
 * @returns 32-bit bit mask where each non-zero bit represents
 *          supported decoder according to MWB_CODE_MASK_... values
 *          defined in BarcodeScanner.h header file.
 */
extern unsigned int MWB_getSupportedCodes(void);

/**
 * Sets rectangular area for barcode scanning with selected single decoder type.
 * After MWB_setScanningRect() call, all subseqent scans will be restricted
 * to this region. If rectangle is not set, whole image is scanned.
 * Also, if width or height is zero, whole image is scanned.
 *
 * Parameters are interpreted as percentage of image dimensions, i.e. ranges are
 * 0 - 100 for all parameters.
 *
 * @param[in]   codeMask            Single decoder type selector (MWB_CODE_MASK_...)
 * @param[in]   left                X coordinate of left edge (percentage)
 * @param[in]   top                 Y coordinate of top edge (percentage)
 * @param[in]   width               Rectangle witdh (x axis) (percentage)
 * @param[in]   height              Rectangle height (y axis) (percentage)
 *
 * @retval      MWB_RT_OK           Rectangle set successfully
 * @retval      MWB_RT_BAD_PARAM    Rectange percentages invalid (out of range)
 */
extern int MWB_setScanningRect(const uint32_t codeMask, float left, float top, float width, float height);

/**
 * Registers licensing information with single selected decoder type.
 * If registering information is correct, enables full support for selected
 * decoder type.
 * It should be called once per decoder type.
 *
 * @param[in]   codeMask                Single decoder type selector (MWB_CODE_MASK_...)
 * @param[in]   userName                User name string
 * @param[in]   key                     License key string
 * 
 * @retval      MWB_RT_OK               Registration successful
 * @retval      MWB_RT_FAIL             Registration failed
 * @retval      MWB_RT_BAD_PARAM        More than one decoder flag selected
 * @retval      MWB_RT_NOT_SUPPORTED    Selected decoder type or its registration
 *                                      is not supported
 */
extern int MWB_registerCode(const uint32_t codeMask, char * userName, char * key);

/**
 * Sets active or inactive status of decoder types and updates decoder execution priority list.
 * Upon library load, all decoder types are inactive by default. User must call this function
 * at least once to choose active set of active decoders.
 *
 * @param[in]       codeMask                ORed bit flags (MWB_CODE_MASK_...) of decoder types
 *                                          to be activated.
 *                                          Bit value '1' activates corresponding decoder, while bit value
 *                                          deactivates it.
 * 
 * @retval          MWB_RT_OK               All requested decoder types supported and activated.
 * @retval          MWB_RT_NOT_SUPPORTED    One or more requested decoder types is not
 *                                          supported in this library release. On this error,
 *                                          activation status of all supported types will not be changed.
 */
extern int MWB_setActiveCodes(const uint32_t codeMask);

/**
 * Set active subcodes for given code group flag.
 * Subcodes under some decoder type are all activated by default.
 *
 * @param[in]       codeMask                Single decoder type/group (MWB_CODE_MASK_...)
 * @param[in]       subMask                 ORed bit flags of requested decoder subtypes (MWB_SUBC_MASK_)
 *
 * @retval          MWB_RT_OK               Activation successful
 * @retval          MWB_RT_BAD_PARAM        No decoder group selected
 * @retval          MWB_RT_NOT_SUPPORTED    Decoder group or subtype not supported
 */
extern int MWB_setActiveSubcodes(const uint32_t codeMask, const uint32_t subMask);

/**
 * @brief       Sets code priority level for selected decoder group or groups.
 * @details     If this library release supports multiple decoder types, user
 *              can activate more than one type to be invoked when main scan image
 *              function is called by user. MWB_setCodePriority enables user to
 *              control order by which decoders will be called.
 *
 * @param[in]   codeMask                Single decoder type/group (MWB_CODE_MASK_...)
 * @param[in]   priority                0 to 254 priority value (0 is the highest priority)
 *
 * @retval      MWB_RT_OK               Success
 * @retval      MWB_RT_NOT_SUPPORTED    Decoder group not supported
 */ 
extern int MWB_setCodePriority(const uint32_t codeMask, const uint8_t priority);

/**
 * Free memory resources allocated by library.
 * Should be invoked when library is not needed anymore, which is typically
 * at application closing time.
 * This cleanup is not necessary on most platforms, as memory resources are
 * deallocated automatically by operating system.
 *
 * @retval  MWB_RT_OK       Success
 */
extern int MWB_cleanupLib(void);

/**
 * Retrieves actual detected code type after successful MWB_scanGrayscaleImage
 * call. If last call was not successful, it will return FOUND_NONE.
 *
 * @retval      res_types           Last decoded type
 * @retval      MWB_RT_FAIL         Library error
 */
int MWB_getLastType(void);

/**
 * Main scan function. Invokes all activated decoders by priority.
 * For successful scan, allocates pp_data buffer and pass it to user.
 * User should deallocate *pp_data pointer when no more needed.
 *
 * @param[in]   pp_image                Byte array representing grayscale value of image pixels.
 *                                      Array shold be stored in row after row fashion, starting with top row.
 * @param[in]   lenX                    X axis size (width) of image.
 * @param[in]   lenY                    Y axis size (length) of image.
 * @param[out]  pp_data                 On successful decode, library allocates new byte array where it stores decoded
 *                                      string result. Pointer to string is passed here. User application is responsible
 *                                      for deallocating this buffer after use.
 *
 * @retval      >0                      Result string length for successful decode
 * @retval      MWB_RT_BAD_PARAM        Null pointer or out of range parameters
 * @retval      MWB_RT_NOT_SUPPORTED    Unsupported decoder found in execution list - library error
 */
extern int MWB_scanGrayscaleImage(uint8_t*  pp_image,  int lenX,  int lenY, uint8_t **pp_data);

/**
 * @brief       Configure options for single barcode type.
 * @details     MWB_setFlags configures options (if any) for decoder type specified in \a codeMask.
 *              Options are given in \a flags as bitwise OR of option bits. Available options depend on selected decoder type.
 * @param[in]   codeMask                Single decoder type (MWB_CODE_MASK_...)
 * @param[in]   flags                   ORed bit mask of selected decoder type options (MWB_FLAG_...)
 * @n                                   <b>RSS decoder</b> - no configuration options
 * @n                                   <b>Datamatrix decoder (DM)</b>
 * @n                                   - MWB_CFG_DM_VIN_MODE - VIN code support for Datamatrix
 * @n                                   <b>Code39 decoder</b>
 * @n                                   - MWB_CFG_CODE39_VIN_MODE - VIN code support for Code39
 * @n                                   - MWB_CFG_CODE39_REQ_CHKSUM - Checksum check mandatory
 *
 * @retval      MWB_RT_OK               Success
 * @retval      MWB_RT_FAIL             No code found in image
 * @retval      MWB_RT_BAD_PARAM        Flag values out of range
 * @retval      MWB_RT_NOT_SUPPORTED    Flag values not supported for selected decoder
 */
extern int MWB_setFlags(const uint32_t codeMask, const uint32_t flags);

/**
 * @brief       Configure global library effort level
 * @details     Barcode detector relies on image processing and geometry inerpolation for
 *              extracting optimal data for decoding. Higher effort level involves more processing
 *              and intermediate parameter values, thus increasing probability of successful
 *              detection with low quality images, but also consuming more CPU time.
 *              Although level is global on library level, each decoder type has its
 *              own parameter set for each level.
 *
 * @param[in]   level                   Effort level - available values are 1, 2, 3, 4 and 5.
 *
 * @retval      MWB_RT_OK               Success
 * @retval      MWB_RT_BAD_PARAM        Level out of range for selected decoder
 */
extern int MWB_setLevel(const int level);
    
/**
 * @brief       Configure scanning direction for 1D barcodes
 * @details     This function enables some control over scanning lines choice
 *              for 1D barcodes. By ORing available bit-masks user can add
 *              one or more direction options to scanning lines set.
 *              Density of lines and angle step for omni scan can be controlled
 *              with MWB_setLevel API function. Available options are:
 * @n           - MWB_SCANDIRECTION_HORIZONTAL - horizontal lines
 * @n           - MWB_SCANDIRECTION_VERTICAL - vertical lines
 * @n           - MWB_SCANDIRECTION_OMNI - omnidirectional lines
 * @n           - MWB_SCANDIRECTION_AUTODETECT - enables BarcodeScanner's
 *                autodetection of barcode direction
 *
 * @param[in]   direction               ORed bit mask of direction modes given with
 *                                      MWB_SCANDIRECTION_... bit-masks
 *
 * @retval      MWB_RT_OK               Success
 * @retval      MWB_RT_BAD_PARAM        Direction out of range
 */
extern int MWB_setDirection(const uint32_t direction);
    
  
/**
 * Check if code is a valid Vehicle Identification Number.
 *
 * @param[in]   vin                     Input code string.
 * @param[in]   length                  Length of input string.
 *
 * @retval      >=0                     Position of detected VIN
 * @retval      MWB_RT_FAIL             Code is not a valid VIN
 */
extern int MWB_validateVIN(char *vin, int length);

/**
 * @brief       QR debug helper.
 * @details     Returns list of coordinates of key points in QR symbol in last
 *              scanned image.
 * @param[out]  buffer                  User provided buffer to be filled with
 *                                      coordinates
 * @param[in]   maxLength               Buffer size - max number of points
 *                                      multiplied by two
 * @retval      > 0                     Number of points in buffer
 */
extern int MWB_getPointsQR(float *buffer, int maxLength);
extern int MWB_getPointsAZTEC(float *buffer, int maxLength);
    
#ifdef __cplusplus
}
#endif

#endif /* _BARCODESCANNER_H_ */

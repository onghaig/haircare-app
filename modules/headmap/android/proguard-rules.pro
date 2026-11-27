# Kept out of R8 in the app's release build (applied through consumerProguardFiles).
#
# MediaPipe's native code reads its Java and protobuf classes by name over JNI (for example the
# graph options' "platform_" field). Renamed or stripped, the face landmarker fails to start
# with "Field platform_ for ... not found" and no frame is ever analysed.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**

# MediaPipe logs through Flogger, which finds its backend by class name when it first loads.
# Stripped, the landmarker dies in a static initializer (ExceptionInInitializerError).
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**

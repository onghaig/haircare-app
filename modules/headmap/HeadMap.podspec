require 'json'

Pod::Spec.new do |s|
  s.name           = 'HeadMap'
  s.version        = '0.1.0'
  s.summary        = 'Guided head scan: camera, on-device face and hair detection, quality checks, hairline measurement.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Haircare'
  s.homepage       = 'https://github.com/onghaig/haircare-app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Apache-2.0 on-device models: Face Landmarker (478 points + pose) and Selfie Multiclass (hair).
  s.dependency 'MediaPipeTasksVision', '~> 0.10.21'

  # The pure-Swift core (also a SwiftPM package with its own tests) is compiled into this pod.
  s.source_files = ['ios/**/*.swift', 'core/Sources/HeadMapCore/**/*.swift']
  s.resource_bundles = { 'HeadMapModels' => ['ios/models/*.{task,tflite}'] }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

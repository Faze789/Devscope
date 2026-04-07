@echo off
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
cd /d C:\fun\Devscope\android
call .\gradlew.bat app:installDebug -PreactNativeDevServerPort=8081 --no-daemon

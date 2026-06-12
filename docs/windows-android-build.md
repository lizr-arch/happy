# Windows 本地打包 Happy Android APK

这份文档是当前仓库在 Windows 上本地打 Android APK 的可执行流程。不要把它当作历史排错记录；按顺序执行即可。

## 适用环境

| 项 | 当前值 |
|---|---|
| 仓库 | `F:\Code\GIT\happy` |
| App 包 | `packages\happy-app` |
| Android 工程 | `packages\happy-app\android` |
| JDK | `C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot` |
| Android SDK | `C:\Users\lizhirui01\AppData\Local\Android\Sdk` |
| APK 产物 | `packages\happy-app\android\app\build\outputs\apk\release\app-release.apk` |

当前 release APK 使用 `android/app/build.gradle` 里的 debug keystore 签名，适合本机安装测试，不是应用商店发布包。

## 一次性检查

在 PowerShell 中执行：

```powershell
cd F:\Code\GIT\happy

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"

java -version
adb version
```

`java -version` 必须是 17 或更高。Gradle 9 不支持 JDK 16。

确认 `packages\happy-app\android\local.properties` 存在，内容应为：

```properties
sdk.dir=C:\\Users\\lizhirui01\\AppData\\Local\\Android\\Sdk
```

如果不存在，创建它：

```powershell
Set-Content -Encoding ASCII packages\happy-app\android\local.properties "sdk.dir=C:\\Users\\lizhirui01\\AppData\\Local\\Android\\Sdk"
```

## 标准构建流程

```powershell
cd F:\Code\GIT\happy

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"
$env:APP_ENV = "preview"

pnpm install
pnpm --filter happy-app typecheck
packages\happy-app\android\gradlew.bat -p packages\happy-app\android assembleRelease
```

构建成功后 APK 在：

```text
packages\happy-app\android\app\build\outputs\apk\release\app-release.apk
```

验证签名：

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose packages\happy-app\android\app\build\outputs\apk\release\app-release.apk
```

如果本机 build-tools 版本不是 `36.0.0`，先查看实际目录：

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools"
```

## 安装到当前手机

先确认手机连接且 USB 调试已授权：

```powershell
adb devices
```

安装 APK：

```powershell
adb install -r packages\happy-app\android\app\build\outputs\apk\release\app-release.apk
```

如果签名或包名冲突，先卸载对应包再装：

```powershell
adb uninstall com.slopus.happy.dev
adb uninstall com.slopus.happy.preview
adb uninstall com.ex3ndr.happy
adb install -r packages\happy-app\android\app\build\outputs\apk\release\app-release.apk
```

查看已安装包：

```powershell
adb shell pm list packages | Select-String happy
```

## 重新生成 Android 工程

通常不要删除 `packages\happy-app\android`，因为当前仓库里已经有为 Windows monorepo 修过的 Gradle 配置。只有在明确需要重新 prebuild 时才执行：

```powershell
cd F:\Code\GIT\happy\packages\happy-app
pnpm exec expo prebuild --platform android
```

重新 prebuild 后必须检查并保留这些关键点：

- `android/app/build.gradle` 中 `react { root = monorepoRoot }` 仍然存在。
- `preBuild` 仍依赖 `buildHappyWire`，否则 `@slopus/happy-wire/dist` 可能缺失。
- `android/local.properties` 指向正确 Android SDK。
- `react-native-enriched` 不应重新出现在 `package.json` 依赖里。

## 常见故障

### Gradle 仍然使用 JDK 16

现象：

```text
Gradle requires JVM 17 or later to run.
```

修复：

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

不要只传 `-Dorg.gradle.java.home=...`，因为 wrapper 启动阶段已经需要正确 JVM。

### `react-native-libsodium` CMake 路径转义失败

现象：

```text
Invalid character escape '\C'
```

修复 `node_modules\@more-tech\react-native-libsodium\android\CMakeLists.txt`，在 `set(CMAKE_CXX_STANDARD 20)` 后添加：

```cmake
string(REPLACE "\\" "/" NODE_MODULES_DIR "${NODE_MODULES_DIR}")
```

每次 `pnpm install` 后如果 node_modules 被重建，可能需要重新检查。

### `libsodium.so` 缺失

现象：

```text
liblibsodium.so, missing and no known rule to make it
```

修复：

```powershell
tar -xzf node_modules\@more-tech\react-native-libsodium\libsodium\build.tgz -C node_modules\@more-tech\react-native-libsodium\libsodium
```

### Skia Android 静态库缺失

现象：

```text
ERROR: Skia prebuilt binaries not found
Could not find libskia.a
```

修复：

```powershell
New-Item -ItemType Directory -Force node_modules\@shopify\react-native-skia\libs\android | Out-Null
xcopy /E /I /Y node_modules\react-native-skia-android\libs node_modules\@shopify\react-native-skia\libs\android
```

### Metro 找不到 `index.ts` 或 `@slopus/happy-wire/dist`

如果错误指向根目录 `index.ts` 或 `@slopus/happy-wire/dist/index.cjs`，先确认 `packages\happy-app\android\app\build.gradle` 里的 monorepo 配置没有被 prebuild 覆盖：

```groovy
def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()
def monorepoRoot = rootDir.getAbsoluteFile().getParentFile().getParentFile().getParentFile()

react {
    root = monorepoRoot
}

tasks.named("preBuild").configure {
    dependsOn(buildHappyWireTask)
}
```

也可以手动先构建 wire 包：

```powershell
pnpm --filter @slopus/happy-wire build
```

### 手机安装后打开的是旧 App

先卸载所有 Happy 包再安装：

```powershell
adb uninstall com.slopus.happy.dev
adb uninstall com.slopus.happy.preview
adb uninstall com.ex3ndr.happy
adb install -r packages\happy-app\android\app\build\outputs\apk\release\app-release.apk
```

## 不要做的事

- 不要用 `expo run:android` 来“打 APK”。它是运行到设备/模拟器，不是稳定的本地 APK 打包流程。
- 不要默认用 EAS 云构建。当前 Windows 本机 Gradle 已可打出 APK。
- 不要在仓库里用 `npm install` 或 `yarn install`，只用 `pnpm`。
- 不要随意删除 `android/` 后不检查 Gradle 配置；Expo prebuild 会覆盖本仓库需要的 monorepo 修复。

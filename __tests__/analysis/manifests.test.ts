import {
  parsePackageJson,
  parsePubspecYaml,
  parseRequirementsTxt,
  parsePyprojectToml,
  parsePipfile,
  parseGemfile,
  parseComposerJson,
  parsePomXml,
  parseBuildGradle,
  parseGoMod,
  parseCargoToml,
  parsePackageSwift,
  parsePodfile,
  parseCsproj,
  parseCMakeLists,
  parseConanfile,
  getManifestForFile,
  MANIFEST_MAP,
} from '../../api/lib/manifests';

// ---------------------------------------------------------------------------
// package.json (Node.js)
// ---------------------------------------------------------------------------
describe('parsePackageJson', () => {
  it('parses dependencies and devDependencies', () => {
    const result = parsePackageJson(JSON.stringify({
      name: 'my-app',
      dependencies: { react: '^18.2.0', lodash: '4.17.21' },
      devDependencies: { jest: '^29.0.0' },
    }));
    expect(result.name).toBe('my-app');
    expect(result.dependencies).toEqual({ react: '^18.2.0', lodash: '4.17.21' });
    expect(result.devDependencies).toEqual({ jest: '^29.0.0' });
  });

  it('returns empty on invalid JSON', () => {
    const result = parsePackageJson('not json {{{');
    expect(result.dependencies).toEqual({});
  });

  it('handles missing fields', () => {
    const result = parsePackageJson('{}');
    expect(result.name).toBe('');
    expect(result.dependencies).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// pubspec.yaml (Dart/Flutter)
// ---------------------------------------------------------------------------
describe('parsePubspecYaml', () => {
  it('parses Dart dependencies', () => {
    const content = `name: sketch_rush
dependencies:
  cupertino_icons: ^1.0.8
  flame: ^1.0.0
dev_dependencies:
  flutter_lints: ^2.0.0
  test: ^1.16.0
`;
    const result = parsePubspecYaml(content);
    expect(result.name).toBe('sketch_rush');
    expect(result.dependencies['cupertino_icons']).toBe('1.0.8');
    expect(result.dependencies['flame']).toBe('1.0.0');
    expect(result.devDependencies['test']).toBe('1.16.0');
    // flutter_lints is skipped
    expect(result.devDependencies['flutter_lints']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// requirements.txt (Python)
// ---------------------------------------------------------------------------
describe('parseRequirementsTxt', () => {
  it('parses pinned and range versions', () => {
    const content = `
django==4.2.1
requests>=2.28.0
numpy~=1.24
flask
# this is a comment
-r other-requirements.txt
celery[redis]==5.3.0
`;
    const result = parseRequirementsTxt(content);
    expect(result.dependencies['django']).toBe('4.2.1');
    expect(result.dependencies['requests']).toBe('2.28.0');
    expect(result.dependencies['numpy']).toBe('1.24');
    expect(result.dependencies['flask']).toBe('*');
    expect(result.dependencies['celery']).toBe('5.3.0');
    expect(Object.keys(result.dependencies)).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// pyproject.toml (Python)
// ---------------------------------------------------------------------------
describe('parsePyprojectToml', () => {
  it('parses project name and dependencies', () => {
    const content = `
[project]
name = "my-tool"
dependencies = ["requests>=2.28", "click~=8.0"]

[project.optional-dependencies]
dev = ["pytest>=7.0", "black"]
`;
    const result = parsePyprojectToml(content);
    expect(result.name).toBe('my-tool');
    expect(result.dependencies['requests']).toBe('2.28');
    expect(result.dependencies['click']).toBe('8.0');
    expect(result.devDependencies['pytest']).toBe('7.0');
  });
});

// ---------------------------------------------------------------------------
// Pipfile (Python)
// ---------------------------------------------------------------------------
describe('parsePipfile', () => {
  it('parses packages and dev-packages', () => {
    const content = `
[packages]
django = "==3.2"
requests = "*"

[dev-packages]
pytest = ">=7.0"
`;
    const result = parsePipfile(content);
    expect(result.dependencies['django']).toBe('3.2');
    expect(result.dependencies['requests']).toBe('*');
    expect(result.devDependencies['pytest']).toBe('7.0');
  });
});

// ---------------------------------------------------------------------------
// Gemfile (Ruby)
// ---------------------------------------------------------------------------
describe('parseGemfile', () => {
  it('parses gems with versions', () => {
    const content = `
source 'https://rubygems.org'

gem 'rails', '~> 7.0'
gem 'pg'

group :development, :test do
  gem 'rspec', '~> 3.12'
end
`;
    const result = parseGemfile(content);
    expect(result.dependencies['rails']).toBe('7.0');
    expect(result.dependencies['pg']).toBe('*');
    expect(result.devDependencies['rspec']).toBe('3.12');
  });
});

// ---------------------------------------------------------------------------
// composer.json (PHP)
// ---------------------------------------------------------------------------
describe('parseComposerJson', () => {
  it('parses require and require-dev', () => {
    const result = parseComposerJson(JSON.stringify({
      name: 'vendor/app',
      require: { 'laravel/framework': '^10.0', 'php': '>=8.1' },
      'require-dev': { 'phpunit/phpunit': '^10.0' },
    }));
    expect(result.name).toBe('vendor/app');
    expect(result.dependencies['laravel/framework']).toBe('^10.0');
    expect(result.devDependencies['phpunit/phpunit']).toBe('^10.0');
  });
});

// ---------------------------------------------------------------------------
// pom.xml (Java/Maven)
// ---------------------------------------------------------------------------
describe('parsePomXml', () => {
  it('parses Maven dependencies with scope', () => {
    const content = `
<project>
  <artifactId>my-app</artifactId>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.20</version>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`;
    const result = parsePomXml(content);
    expect(result.name).toBe('my-app');
    expect(result.dependencies['org.springframework:spring-core']).toBe('5.3.20');
    expect(result.devDependencies['junit:junit']).toBe('4.13.2');
  });
});

// ---------------------------------------------------------------------------
// build.gradle (Java/Kotlin)
// ---------------------------------------------------------------------------
describe('parseBuildGradle', () => {
  it('parses Gradle dependency declarations', () => {
    const content = `
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web:3.1.0'
    implementation("com.google.guava:guava:32.0.0-jre")
    testImplementation 'junit:junit:4.13.2'
}
`;
    const result = parseBuildGradle(content);
    expect(result.dependencies['org.springframework.boot:spring-boot-starter-web']).toBe('3.1.0');
    expect(result.dependencies['com.google.guava:guava']).toBe('32.0.0-jre');
    expect(result.devDependencies['junit:junit']).toBe('4.13.2');
  });
});

// ---------------------------------------------------------------------------
// go.mod (Go)
// ---------------------------------------------------------------------------
describe('parseGoMod', () => {
  it('parses Go module dependencies', () => {
    const content = `
module github.com/user/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/joho/godotenv v1.5.1
	golang.org/x/text v0.13.0 // indirect
)

require github.com/stretchr/testify v1.8.4
`;
    const result = parseGoMod(content);
    expect(result.name).toBe('github.com/user/myapp');
    expect(result.dependencies['github.com/gin-gonic/gin']).toBe('v1.9.1');
    expect(result.dependencies['github.com/joho/godotenv']).toBe('v1.5.1');
    expect(result.dependencies['github.com/stretchr/testify']).toBe('v1.8.4');
    // indirect deps go to devDependencies
    expect(result.devDependencies['golang.org/x/text']).toBe('v0.13.0');
  });
});

// ---------------------------------------------------------------------------
// Cargo.toml (Rust)
// ---------------------------------------------------------------------------
describe('parseCargoToml', () => {
  it('parses Rust crate dependencies', () => {
    const content = `
[package]
name = "my-crate"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.28", features = ["full"] }

[dev-dependencies]
criterion = "0.5"
`;
    const result = parseCargoToml(content);
    expect(result.name).toBe('my-crate');
    expect(result.dependencies['serde']).toBe('1.0');
    expect(result.dependencies['tokio']).toBe('1.28');
    expect(result.devDependencies['criterion']).toBe('0.5');
  });
});

// ---------------------------------------------------------------------------
// Package.swift (Swift)
// ---------------------------------------------------------------------------
describe('parsePackageSwift', () => {
  it('parses Swift package dependencies', () => {
    const content = `
let package = Package(
    name: "MyApp",
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire", from: "5.6.0"),
        .package(url: "https://github.com/vapor/vapor.git", exact: "4.77.0"),
    ]
)
`;
    const result = parsePackageSwift(content);
    expect(result.name).toBe('MyApp');
    expect(result.dependencies['Alamofire']).toBe('5.6.0');
    expect(result.dependencies['vapor']).toBe('4.77.0');
  });
});

// ---------------------------------------------------------------------------
// Podfile (iOS/CocoaPods)
// ---------------------------------------------------------------------------
describe('parsePodfile', () => {
  it('parses CocoaPods dependencies', () => {
    const content = `
platform :ios, '15.0'

target 'MyApp' do
  pod 'Alamofire', '~> 5.6'
  pod 'SnapKit'
end
`;
    const result = parsePodfile(content);
    expect(result.dependencies['Alamofire']).toBe('5.6');
    expect(result.dependencies['SnapKit']).toBe('*');
  });
});

// ---------------------------------------------------------------------------
// .csproj (.NET/C#)
// ---------------------------------------------------------------------------
describe('parseCsproj', () => {
  it('parses NuGet PackageReference entries', () => {
    const content = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Serilog" Version="3.1.1" />
  </ItemGroup>
</Project>
`;
    const result = parseCsproj(content);
    expect(result.dependencies['Newtonsoft.Json']).toBe('13.0.3');
    expect(result.dependencies['Serilog']).toBe('3.1.1');
  });

  it('parses packages.config format', () => {
    const content = `
<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="EntityFramework" version="6.4.4" targetFramework="net48" />
</packages>
`;
    const result = parseCsproj(content);
    expect(result.dependencies['EntityFramework']).toBe('6.4.4');
  });
});

// ---------------------------------------------------------------------------
// CMakeLists.txt (C/C++)
// ---------------------------------------------------------------------------
describe('parseCMakeLists', () => {
  it('parses find_package and FetchContent', () => {
    const content = `
project(my_app)

find_package(Boost 1.80 REQUIRED)
find_package(OpenSSL REQUIRED)

include(FetchContent)
FetchContent_Declare(
  fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG 10.0.0
)
`;
    const result = parseCMakeLists(content);
    expect(result.name).toBe('my_app');
    expect(result.dependencies['Boost']).toBe('1.80');
    expect(result.dependencies['OpenSSL']).toBe('*');
    expect(result.dependencies['fmt']).toBe('10.0.0');
  });
});

// ---------------------------------------------------------------------------
// conanfile.txt (C/C++)
// ---------------------------------------------------------------------------
describe('parseConanfile', () => {
  it('parses Conan requires', () => {
    const content = `
[requires]
fmt/10.0.0
boost/1.82.0
`;
    const result = parseConanfile(content);
    expect(result.dependencies['fmt']).toBe('10.0.0');
    expect(result.dependencies['boost']).toBe('1.82.0');
  });
});

// ---------------------------------------------------------------------------
// Manifest detection helpers
// ---------------------------------------------------------------------------
describe('getManifestForFile', () => {
  it('detects standard manifest filenames', () => {
    expect(getManifestForFile('package.json')?.ecosystem).toBe('npm');
    expect(getManifestForFile('pubspec.yaml')?.ecosystem).toBe('pub');
    expect(getManifestForFile('go.mod')?.ecosystem).toBe('go');
    expect(getManifestForFile('Cargo.toml')?.ecosystem).toBe('crates.io');
    expect(getManifestForFile('Gemfile')?.ecosystem).toBe('rubygems');
    expect(getManifestForFile('requirements.txt')?.ecosystem).toBe('pypi');
  });

  it('detects .csproj files by extension', () => {
    expect(getManifestForFile('MyApp.csproj')?.ecosystem).toBe('nuget');
    expect(getManifestForFile('Lib.fsproj')?.ecosystem).toBe('nuget');
  });

  it('returns null for unknown files', () => {
    expect(getManifestForFile('README.md')).toBeNull();
    expect(getManifestForFile('main.py')).toBeNull();
  });
});

describe('MANIFEST_MAP', () => {
  it('covers all expected manifest files', () => {
    const expected = [
      'package.json', 'pubspec.yaml', 'requirements.txt', 'pyproject.toml',
      'Pipfile', 'Gemfile', 'composer.json', 'pom.xml', 'build.gradle',
      'build.gradle.kts', 'go.mod', 'Cargo.toml', 'Package.swift',
      'Podfile', 'CMakeLists.txt', 'conanfile.txt',
    ];
    for (const f of expected) {
      expect(MANIFEST_MAP[f]).toBeDefined();
    }
  });
});

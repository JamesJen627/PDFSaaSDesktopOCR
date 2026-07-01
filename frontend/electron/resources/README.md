# Bundled runtime assets (not committed)

Copy JRE + stirling-pdf JAR here before production builds:

```powershell
task desktop:jlink
task electron:bundle-resources
```

Expected layout:

```
resources/
  runtime/jre/          # jlink output (java.exe)
  libs/stirling-pdf-*.jar
  ocr-service/          # stub (committed)
```

Production installer: `task electron:build`  
Unpacked smoke build (no JRE required): `task electron:pack`

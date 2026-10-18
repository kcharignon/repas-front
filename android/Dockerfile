# syntax=docker/dockerfile:1
# Image de construction de l'application Android « Repas Drive » (DRV-311) : JDK 17, Gradle et SDK Android.
# Rien n'y contacte un autre site que les dépôts officiels (Gradle, Google, Maven Central). `make android` et ses voisines s'en servent.
FROM eclipse-temurin:17.0.20_8-jdk-jammy

ARG GRADLE_VERSION=8.14.6
ARG GRADLE_SHA256=7988ed071b2a07900e2ec715fca15c6ab72bce6db433af301fa7fa7e9407bd24
# « commandlinetools-linux-<n>_latest.zip » : le numéro et l'empreinte SHA-1 (e025545c…) sont ceux du dépôt officiel de Google.
ARG CMDLINE_TOOLS=16111833
ARG CMDLINE_TOOLS_SHA256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8
ARG ANDROID_PLATFORM=36
ARG ANDROID_BUILD_TOOLS=36.0.0

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    && echo "${GRADLE_SHA256}  /tmp/gradle.zip" | sha256sum -c - \
    && unzip -q /tmp/gradle.zip -d /opt \
    && ln -s "/opt/gradle-${GRADLE_VERSION}" /opt/gradle \
    && rm /tmp/gradle.zip

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
RUN curl -fsSL -o /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" \
    && echo "${CMDLINE_TOOLS_SHA256}  /tmp/cmdline-tools.zip" | sha256sum -c - \
    && mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && unzip -q /tmp/cmdline-tools.zip -d "${ANDROID_HOME}/cmdline-tools" \
    && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm /tmp/cmdline-tools.zip

# Les licences du SDK Android sont acceptées ici, à la construction de l'image (comme dans toute image de CI Android).
# `platform-tools` y est installé aussi : sans lui, le plugin Android le télécharge à chaque construction, et un incident réseau à ce moment fait échouer la construction avant tout contrôle (DRV-315).
RUN (set +o pipefail; yes | "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null) \
    && "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" > /dev/null \
    && chmod -R a+rwX "${ANDROID_HOME}"

ENV ANDROID_BUILD_TOOLS=${ANDROID_BUILD_TOOLS}

# L'image tourne avec l'identifiant de l'utilisateur de la machine (`docker compose run --user`), donc le cache de Gradle
# et le dossier personnel doivent être ouverts en écriture à tout le monde.
ENV GRADLE_USER_HOME=/gradle
ENV HOME=/tmp/home
ENV PATH="/opt/gradle/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${PATH}"
RUN mkdir -p /gradle /tmp/home && chmod 1777 /gradle /tmp/home

WORKDIR /work/android

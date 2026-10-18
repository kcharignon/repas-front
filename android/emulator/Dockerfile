# syntax=docker/dockerfile:1
# Image de l'émulateur Android de test (DRV-319) : les outils seulement. Le SDK, l'émulateur, l'image système et l'AVD sont téléchargés au
# premier lancement dans le volume Docker `android-emulator-sdk` (monté sur /sdk), puis réutilisés : rien n'est à refaire ensuite.
# Aucun site d'enseigne n'est contacté : le seul accès à Internet sert à télécharger le SDK chez Google (dl.google.com).
FROM eclipse-temurin:17.0.20_8-jdk-jammy

# Mêmes outils en ligne de commande que l'image de construction (android/Dockerfile), même empreinte.
ARG CMDLINE_TOOLS=16111833
ARG CMDLINE_TOOLS_SHA256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# dnsmasq : le DNS de l'émulateur (tout *.leclercdrive.fr pointe vers le faux site, le reste ne se résout pas) ; python3 et openssl : le faux
# site local (HTTPS) ; les bibliothèques sont celles dont l'émulateur a besoin même sans fenêtre.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip dnsmasq python3 openssl procps iproute2 \
       libpulse0 libgl1 libnss3 libx11-6 libxcb1 libxdamage1 libxcomposite1 libxcursor1 libxi6 libxtst6 libxrandr2 libxkbfile1 \
       libasound2 libdbus-1-3 libbsd0 libnspr4 \
    && rm -rf /var/lib/apt/lists/*

# Node, le même que celui du front (Dockerfile racine, `node:24`) : il fait tourner le faux site Leclerc complet (drive-agent/fake-leclerc,
# monté en lecture seule sur /opt/fake-leclerc par compose.yaml), derrière le faux site HTTPS de testsite.py (DRV-319, partie 2).
COPY --from=node:24.22.0-bookworm-slim /usr/local/bin/node /usr/local/bin/node

RUN curl -fsSL -o /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" \
    && echo "${CMDLINE_TOOLS_SHA256}  /tmp/cmdline-tools.zip" | sha256sum -c - \
    && mkdir -p /opt/cmdline-tools \
    && unzip -q /tmp/cmdline-tools.zip -d /opt/cmdline-tools \
    && mv /opt/cmdline-tools/cmdline-tools /opt/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip

# Tout ce qui est lourd ou qui change vit dans le volume monté sur /sdk (SDK, émulateur, image système, AVD, clés d'adb, certificat de test).
ENV ANDROID_SDK_ROOT=/sdk
ENV ANDROID_HOME=/sdk
ENV ANDROID_USER_HOME=/sdk/.android
ENV ANDROID_AVD_HOME=/sdk/.android/avd
ENV PATH="/opt/cmdline-tools/latest/bin:/sdk/platform-tools:/sdk/emulator:${PATH}"

COPY entrypoint.sh testsite.py testpage.html repaspage.html /opt/repas-emulator/
RUN chmod +x /opt/repas-emulator/entrypoint.sh && mkdir -p /sdk

WORKDIR /sdk
ENTRYPOINT ["/opt/repas-emulator/entrypoint.sh"]

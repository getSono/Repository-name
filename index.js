const express = require("express");
const { v4: uuidv4 } = require("uuid");
const gTTS = require("gtts");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const TMP_DIR = "./tmp";
const SOUNDS_DIR = "./sounds";

// Ordner anlegen, falls nicht vorhanden
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR);

const cachedAudio = new Map();

// gTTS unterstützt diese Sprachen (Auszug)
const SUPPORTED_LANGS = new Set([
  "en", "de", "fr", "es", "it", "pt", "ru", "ja", "zh", "ko"
]);

function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("Fehler beim Löschen:", err);
  });
}

app.get("/", async (req, res) => {
  const text = req.query.text;
  let lang = (req.query.lang || "en").toLowerCase();

  if (!text) return res.status(400).send("Missing text parameter");

  // 1️⃣ Normalisieren: alles nach '-' ignorieren (en-EN → en)
  if (lang.includes("-")) {
    lang = lang.split("-")[0];
  }

  // 2️⃣ Prüfen, ob die Sprache unterstützt wird
  if (!SUPPORTED_LANGS.has(lang)) lang = "en";

  // 3️⃣ Prüfen, ob es eine passende MP3-Datei im sounds/ Ordner gibt
  const soundFile = path.join(SOUNDS_DIR, `${text}.mp3`);
  if (fs.existsSync(soundFile)) {
    return res.sendFile(path.resolve(soundFile));
  }

  // 4️⃣ Prüfen, ob es im Cache ist
  if (cachedAudio.has(text)) {
    return res.sendFile(path.resolve(cachedAudio.get(text)));
  }

  const uuid = uuidv4();
  const mp3Path = path.join(TMP_DIR, `${uuid}.mp3`);
  const wavPath = path.join(TMP_DIR, `${uuid}.wav`);

  try {
    // gTTS
    const gtts = new gTTS(text, lang);
    await new Promise((resolve, reject) => {
      gtts.save(mp3Path, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // MP3 → WAV
    await new Promise((resolve, reject) => {
      ffmpeg(mp3Path)
        .toFormat("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(wavPath);
    });

    // Cache updaten
    cachedAudio.set(text, wavPath);
    if (cachedAudio.size > 10) {
      const oldestKey = cachedAudio.keys().next().value;
      const oldPath = cachedAudio.get(oldestKey);
      cachedAudio.delete(oldestKey);
      cleanup(oldPath);
    }

    cleanup(mp3Path);
    return res.sendFile(path.resolve(wavPath));
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).send("Fehler bei TTS");
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});

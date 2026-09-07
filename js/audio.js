const buzzerSound = new Audio("./assets/audio/buzzer.mp3");
buzzerSound.preload = "auto";
buzzerSound.volume = 0.5;

let unlocked = false;

/**
 * Gibt die Wiedergabe für diese Sitzung frei.
 *
 * Browser blocken play() ohne vorherige Nutzergeste im Tab. Betroffen ist genau
 * der Fall, der zählt: Wer nicht selbst gebuzzert hat, hat womöglich seit dem
 * Laden nichts angeklickt und hört den Buzzer deshalb nie — sichtbar wird das
 * nur als Warnung in der Konsole.
 *
 * Muss deshalb aus einer echten Geste heraus aufgerufen werden. Einmal kurz mit
 * Lautstärke 0 anspielen und sofort stoppen genügt, um das Element für den Rest
 * der Sitzung freizuschalten. Bewusst über die Lautstärke und nicht über muted:
 * eine stumme Wiedergabe ist ohnehin erlaubt und würde das Element nicht
 * freischalten.
 */
export async function unlockBuzzerSound() {
  if (unlocked) return true;

  const previousVolume = buzzerSound.volume;
  try {
    buzzerSound.volume = 0;
    await buzzerSound.play();
    buzzerSound.pause();
    buzzerSound.currentTime = 0;
    unlocked = true;
    return true;
  } catch (error) {
    console.warn("Buzzer sound could not be unlocked yet:", error);
    return false;
  } finally {
    buzzerSound.volume = previousVolume;
  }
}

export function isBuzzerSoundUnlocked() {
  return unlocked;
}

export async function playBuzzerSound() {
  try {
    buzzerSound.currentTime = 0;
    await buzzerSound.play();
    unlocked = true;
    return true;
  } catch (error) {
    console.warn("Buzzer sound could not be played:", error);
    return false;
  }
}

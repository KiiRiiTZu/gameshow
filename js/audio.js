const buzzerSound = new Audio("./assets/audio/buzzer.mp3");
buzzerSound.preload = "auto";
buzzerSound.volume = 0.5;

export async function playBuzzerSound() {
  try {
    buzzerSound.currentTime = 0;
    await buzzerSound.play();
    return true;
  } catch (error) {
    console.warn("Buzzer sound could not be played:", error);
    return false;
  }
}

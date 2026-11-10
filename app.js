const photoInput = document.querySelector("#photo-input");
const dropzone = document.querySelector("#dropzone");
const photoList = document.querySelector("#photo-list");
const emptyState = document.querySelector("#empty-state");
const fileCount = document.querySelector("#file-count");
const clearButton = document.querySelector("#clear-button");
const sizePreset = document.querySelector("#size-preset");
const customSize = document.querySelector("#custom-size");
const processButton = document.querySelector("#process-button");
const processStatus = document.querySelector("#process-status");
const resultsSection = document.querySelector("#results-section");
const resultsGrid = document.querySelector("#results-grid");
const resultsCount = document.querySelector("#results-count");
const previewDialog = document.querySelector("#preview-dialog");
const previewClose = document.querySelector("#preview-close");
const previewImage = document.querySelector("#preview-image");
const previewStatus = document.querySelector("#preview-status");

let photos = [];
let results = [];
let nextPhotoId = 0;
let isProcessing = false;
let isPreviewing = false;
let previewUrl = "";
let previewRequestId = 0;

photoInput.addEventListener("change", (event) => {
  addPhotos(event.target.files);
  photoInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  });
}

dropzone.addEventListener("drop", (event) => {
  addPhotos(event.dataTransfer.files);
});

sizePreset.addEventListener("change", () => {
  customSize.hidden = sizePreset.value !== "custom";
});

clearButton.addEventListener("click", () => {
  photos = [];
  renderPhotos();
  clearResults();
  setStatus("");
});

processButton.addEventListener("click", processPhotos);
previewClose.addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("close", () => {
  previewRequestId += 1;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }
  previewImage.removeAttribute("src");
  previewImage.hidden = true;
  isPreviewing = false;
  renderPhotos();
});

function addPhotos(fileList) {
  if (isProcessing) {
    setStatus("Wait for the current batch to finish before adding more photos.");
    return;
  }

  const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  const rejectedCount = fileList.length - imageFiles.length;

  for (const file of imageFiles) {
    photos.push({
      id: nextPhotoId++,
      file,
      url: URL.createObjectURL(file),
    });
  }

  renderPhotos();
  clearResults();

  if (rejectedCount > 0) {
    setStatus(`${rejectedCount} non-image file${rejectedCount === 1 ? " was" : "s were"} skipped.`);
  } else if (imageFiles.length > 0) {
    setStatus("");
  }
}

function renderPhotos() {
  photoList.replaceChildren();
  if (photos.length === 0) {
    photoList.append(emptyState);
  } else {
    for (const photo of photos) {
      const row = document.createElement("div");
      row.className = "photo-row";

      const thumbnail = document.createElement("img");
      thumbnail.className = "photo-thumb";
      thumbnail.src = photo.url;
      thumbnail.alt = "";

      const previewButton = document.createElement("button");
      previewButton.className = "photo-preview-button";
      previewButton.type = "button";
      previewButton.disabled = isProcessing || isPreviewing;
      previewButton.setAttribute("aria-label", `Preview ${photo.file.name} with current settings`);
      const previewLabel = document.createElement("span");
      previewLabel.textContent = "Click to preview";
      previewButton.append(thumbnail, previewLabel);
      previewButton.addEventListener("click", () => previewPhoto(photo));

      const info = document.createElement("div");
      info.className = "photo-info";

      const name = document.createElement("div");
      name.className = "photo-name";
      name.textContent = photo.file.name;

      const meta = document.createElement("div");
      meta.className = "photo-meta";
      meta.textContent = formatBytes(photo.file.size);

      const removeButton = document.createElement("button");
      removeButton.className = "remove-photo";
      removeButton.type = "button";
      removeButton.disabled = isProcessing || isPreviewing;
      removeButton.setAttribute("aria-label", `Remove ${photo.file.name}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => removePhoto(photo.id));

      info.append(name, meta);
      row.append(previewButton, info, removeButton);
      photoList.append(row);
    }
  }

  fileCount.textContent = photos.length === 0
    ? "No photos yet"
    : `${photos.length} photo${photos.length === 1 ? "" : "s"} selected`;
  clearButton.disabled = photos.length === 0 || isProcessing || isPreviewing;
  processButton.disabled = photos.length === 0 || isProcessing || isPreviewing;
  photoInput.disabled = isProcessing || isPreviewing;
}

async function previewPhoto(photo) {
  if (isProcessing || isPreviewing) {
    return;
  }

  const dimensions = getDimensions();
  if (dimensions === undefined) {
    setStatus("Enter valid width and height values between 1 and 12,000 pixels.");
    return;
  }

  isPreviewing = true;
  const requestId = ++previewRequestId;
  previewStatus.textContent = `Preparing preview for ${photo.file.name}…`;
  previewImage.hidden = true;
  previewDialog.showModal();
  renderPhotos();

  const watermark = document.querySelector("#watermark-text").value.trim();
  const position = document.querySelector("#watermark-position").value;
  try {
    const preview = await processPhoto(photo, dimensions, watermark, position);
    if (!previewDialog.open || requestId !== previewRequestId) {
      URL.revokeObjectURL(preview.url);
      return;
    }

    previewUrl = preview.url;
    previewImage.src = preview.url;
    previewImage.alt = `Preview of ${photo.file.name} with current settings`;
    previewImage.hidden = false;
    previewStatus.textContent = `${photo.file.name} · ${preview.width} × ${preview.height}${watermark ? ` · Watermark: ${watermark} (${position.replace("-", " ")})` : " · No watermark"}`;
  } catch (error) {
    console.error("Could not create the photo preview.", error);
    previewStatus.textContent = "This photo could not be previewed. Try using a JPG, PNG, or WebP image.";
  } finally {
    if (requestId === previewRequestId) {
      isPreviewing = false;
      if (!previewDialog.open) {
        renderPhotos();
      }
    }
  }
}

function removePhoto(id) {
  const removedPhoto = photos.find((photo) => photo.id === id);
  if (removedPhoto) {
    URL.revokeObjectURL(removedPhoto.url);
  }
  photos = photos.filter((photo) => photo.id !== id);
  renderPhotos();
  clearResults();
}

function clearResults() {
  for (const result of results) {
    URL.revokeObjectURL(result.url);
  }
  results = [];
  resultsGrid.replaceChildren();
  resultsSection.hidden = true;
}

async function processPhotos() {
  if (isProcessing || photos.length === 0) {
    return;
  }

  const dimensions = getDimensions();
  if (dimensions === undefined) {
    setStatus("Enter valid width and height values between 1 and 12,000 pixels.");
    return;
  }

  isProcessing = true;
  renderPhotos();
  clearResults();
  setStatus("Processing your photos…");
  const watermark = document.querySelector("#watermark-text").value.trim();
  const position = document.querySelector("#watermark-position").value;
  const completed = [];

  try {
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      setStatus(`Processing ${index + 1} of ${photos.length}: ${photo.file.name}`);
      completed.push(await processPhoto(photo, dimensions, watermark, position));
    }

    results = completed;
    renderResults();
    setStatus(`Done — ${results.length} photo${results.length === 1 ? "" : "s"} ready to download.`);
  } catch (error) {
    for (const result of completed) {
      URL.revokeObjectURL(result.url);
    }
    console.error("Could not process the selected photos.", error);
    setStatus("Some photos could not be processed. Try using JPG, PNG, or WebP images.");
  } finally {
    isProcessing = false;
    renderPhotos();
  }
}

function getDimensions() {
  if (sizePreset.value === "original") {
    return null;
  }

  if (sizePreset.value !== "custom") {
    const side = Number(sizePreset.value);
    return { width: side, height: side };
  }

  const width = Number(document.querySelector("#custom-width").value);
  const height = Number(document.querySelector("#custom-height").value);
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > 12000 || height > 12000) {
    return undefined;
  }
  return { width, height };
}

async function processPhoto(photo, dimensions, watermark, position) {
  const image = await loadImage(photo.url);
  const maxWidth = dimensions?.width ?? image.naturalWidth;
  const maxHeight = dimensions?.height ?? image.naturalHeight;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  context.drawImage(image, 0, 0, width, height);
  if (watermark) {
    drawWatermark(context, width, height, watermark, position);
  }

  const mimeType = getOutputType(photo.file.type);
  const blob = await canvasToBlob(canvas, mimeType);
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const baseName = photo.file.name.replace(/\.[^.]+$/, "") || "photo";
  return {
    name: `${baseName}-edited.${extension}`,
    width,
    height,
    size: blob.size,
    url: URL.createObjectURL(blob),
  };
}

function drawWatermark(context, width, height, text, position) {
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.035));
  const padding = Math.max(12, Math.round(fontSize * 0.65));
  context.font = `600 ${fontSize}px "DM Sans", sans-serif`;
  context.textBaseline = "top";
  const textWidth = context.measureText(text).width;
  const boxWidth = textWidth + padding * 1.2;
  const boxHeight = fontSize + padding * 0.9;
  let x = padding;
  let y = padding;

  if (position.includes("right")) {
    x = width - boxWidth - padding;
  }
  if (position.includes("bottom")) {
    y = height - boxHeight - padding;
  }
  if (position === "center") {
    x = (width - boxWidth) / 2;
    y = (height - boxHeight) / 2;
  }

  context.fillStyle = "rgba(0, 0, 0, 0.42)";
  context.fillRect(x, y, boxWidth, boxHeight);
  context.fillStyle = "#ffffff";
  context.fillText(text, x + padding * 0.6, y + padding * 0.45);
}

function getOutputType(inputType) {
  if (["image/jpeg", "image/png", "image/webp"].includes(inputType)) {
    return inputType;
  }
  return "image/png";
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.src = url;
  });
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The edited image could not be exported."));
      }
    }, type, 0.92);
  });
}

function renderResults() {
  resultsGrid.replaceChildren();
  for (const result of results) {
    const card = document.createElement("article");
    card.className = "result-card";

    const image = document.createElement("img");
    image.src = result.url;
    image.alt = `Processed ${result.name}`;

    const info = document.createElement("div");
    info.className = "result-info";

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = result.name;

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${result.width} × ${result.height} · ${formatBytes(result.size)}`;

    const download = document.createElement("a");
    download.className = "download-link";
    download.href = result.url;
    download.download = result.name;
    download.textContent = "Download photo ↓";

    info.append(name, meta, download);
    card.append(image, info);
    resultsGrid.append(card);
  }
  resultsCount.textContent = `${results.length} ready`;
  resultsSection.hidden = false;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message) {
  processStatus.textContent = message;
}

window.addEventListener("beforeunload", () => {
  for (const photo of photos) {
    URL.revokeObjectURL(photo.url);
  }
  for (const result of results) {
    URL.revokeObjectURL(result.url);
  }
});

renderPhotos();

const CODE_COOKIE = "keep_d1_code";
const NOTE_PREVIEW_CHARS = 240;
const NOTE_PREVIEW_LINES = 6;
const MAX_IMAGE_DATA_URL_LENGTH = 1800000;
const IMAGE_COMPRESS_STEPS = [
    { edge: 1600, quality: 0.82 },
    { edge: 1280, quality: 0.78 },
    { edge: 1024, quality: 0.74 },
    { edge: 800, quality: 0.70 }
];
const app = document.querySelector("#app");
const form = document.querySelector("#form");
const titleInput = document.querySelector("#title");
const imagePreview = document.querySelector("#imagePreview");
const imagePreviewImg = document.querySelector("#imagePreviewImg");
const removeImageButton = document.querySelector("#removeImageButton");
const composerError = document.querySelector("#composerError");
const list = document.querySelector("#list");
const count = document.querySelector("#count");
const codeGate = document.querySelector("#codeGate");
const codeForm = document.querySelector("#codeForm");
const codeInput = document.querySelector("#codeInput");
const currentCode = document.querySelector("#currentCode");
const changeCodeButton = document.querySelector("#changeCodeButton");
const copyLinkButton = document.querySelector("#copyLinkButton");
const noteModal = document.querySelector("#noteModal");
const noteModalDate = document.querySelector("#noteModalDate");
const noteModalText = document.querySelector("#noteModalText");
const noteModalImage = document.querySelector("#noteModalImage");
const closeNoteModalButton = document.querySelector("#closeNoteModalButton");
const closeNoteModalFooterButton = document.querySelector("#closeNoteModalFooterButton");
const copyModalNoteButton = document.querySelector("#copyModalNoteButton");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});
let activeCode = "";
let activeModalNote = "";
let pendingImage = "";
let imagePasteTask = null;

function normalizeCode(value) {
    return String(value ?? "").trim();
}

function resizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight >= 260 ? "auto" : "hidden";
}

function setComposerError(message) {
    composerError.textContent = message;
    composerError.hidden = !message;
}

function clearComposerError() {
    setComposerError("");
}

function setPendingImage(image) {
    pendingImage = image;

    if (pendingImage) {
    imagePreviewImg.src = pendingImage;
    imagePreview.hidden = false;
    return;
    }

    imagePreviewImg.removeAttribute("src");
    imagePreview.hidden = true;
}

function insertTextAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.selectionStart = start + text.length;
    input.selectionEnd = start + text.length;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Không đọc được ảnh")), { once: true });
    image.src = src;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
    });
}

async function imageToDataUrl(image, step) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, step.edge / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không nén được ảnh");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/webp", step.quality);
    if (!blob) {
    return canvas.toDataURL("image/png");
    }

    return blobToDataUrl(blob);
}

async function compressImageFile(file) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Định dạng ảnh không hỗ trợ");
    }

    const source = await fileToDataUrl(file);

    if (file.type === "image/gif" && source.length <= MAX_IMAGE_DATA_URL_LENGTH) {
    return source;
    }

    const image = await loadImage(source);
    let smallestDataUrl = "";

    for (const step of IMAGE_COMPRESS_STEPS) {
    const dataUrl = await imageToDataUrl(image, step);
    if (!smallestDataUrl || dataUrl.length < smallestDataUrl.length) {
        smallestDataUrl = dataUrl;
    }
    if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
        return dataUrl;
    }
    }

    if (source.length <= MAX_IMAGE_DATA_URL_LENGTH && source.length < smallestDataUrl.length) {
    return source;
    }

    throw new Error("Ảnh quá lớn");
}

async function handleTitlePaste(event) {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const imageFiles = Array.from(clipboard.items || [])
    .map((item) => item.kind === "file" ? item.getAsFile() : null)
    .filter((file) => file && file.type.startsWith("image/"));

    if (!imageFiles.length) return;

    event.preventDefault();

    const pastedText = clipboard.getData("text/plain");
    if (pastedText) {
    insertTextAtCursor(titleInput, pastedText);
    }

    clearComposerError();
    const task = compressImageFile(imageFiles[0]);
    imagePasteTask = task;

    try {
    const image = await task;
    if (imagePasteTask === task) {
        setPendingImage(image);
    }
    } catch (error) {
    if (imagePasteTask === task) {
        setComposerError("Không thể paste ảnh này. Vui lòng thử ảnh nhỏ hơn.");
    }
    } finally {
    if (imagePasteTask === task) {
        imagePasteTask = null;
    }
    }
}

function formatDate(value) {
    if (!value) return "";

    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

function getCookie(name) {
    const prefix = `${name}=`;
    const row = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

    if (!row) return "";

    try {
    return decodeURIComponent(row.slice(prefix.length));
    } catch (error) {
    return "";
    }
}

function saveCodeCookie(code) {
    document.cookie = `${CODE_COOKIE}=${encodeURIComponent(code)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function getUrlCode() {
    const url = new URL(window.location.href);
    return normalizeCode(url.searchParams.get("code"));
}

function syncUrlCode(code, mode = "replaceState") {
    const url = new URL(window.location.href);
    url.searchParams.set("code", code);
    window.history[mode]({}, "", url);
}

function notesUrl(path = "") {
    const url = new URL(`/api/keeps${path}`, window.location.origin);
    url.searchParams.set("code", activeCode);
    return url;
}

function updateCount(total) {
    count.textContent = `${total} ghi chú`;
}

function renderEmpty(message, className = "empty") {
    list.replaceChildren();

    const empty = document.createElement("div");
    empty.className = className;
    empty.textContent = message;
    list.append(empty);
}

function clipPreviewAtWord(text) {
    if (text.length <= NOTE_PREVIEW_CHARS) return text;

    const clipped = text.slice(0, NOTE_PREVIEW_CHARS).trimEnd();
    const lastBreak = Math.max(
    clipped.lastIndexOf(" "),
    clipped.lastIndexOf("\n"),
    clipped.lastIndexOf("\t")
    );

    if (lastBreak > NOTE_PREVIEW_CHARS * 0.65) {
    return clipped.slice(0, lastBreak).trimEnd();
    }

    return clipped;
}

function getNotePreview(value) {
    const fullText = String(value ?? "");
    const lines = fullText.split(/\r\n|\r|\n/);
    const previewByLines = lines.slice(0, NOTE_PREVIEW_LINES).join("\n");
    const truncatedByLines = lines.length > NOTE_PREVIEW_LINES;
    const truncatedByChars = previewByLines.length > NOTE_PREVIEW_CHARS;
    const previewText = clipPreviewAtWord(previewByLines);
    const isTruncated = truncatedByLines || truncatedByChars;

    return {
    text: isTruncated ? `${previewText}...` : fullText,
    isTruncated
    };
}

function openNoteModal(keep) {
    const dateText = formatDate(keep.created_at);
    const image = String(keep.image ?? "");
    activeModalNote = String(keep.title ?? "");
    noteModalText.textContent = activeModalNote;
    noteModalText.hidden = !activeModalNote;
    copyModalNoteButton.hidden = !activeModalNote;
    noteModalDate.textContent = dateText;
    noteModalDate.hidden = !dateText;

    if (image) {
    noteModalImage.src = image;
    noteModalImage.hidden = false;
    } else {
    noteModalImage.removeAttribute("src");
    noteModalImage.hidden = true;
    }

    if (typeof noteModal.showModal === "function") {
    noteModal.showModal();
    } else {
    noteModal.setAttribute("open", "");
    }

    closeNoteModalButton.focus();
}

function closeNoteModal() {
    if (typeof noteModal.close === "function" && noteModal.open) {
    noteModal.close();
    return;
    }

    noteModal.removeAttribute("open");
}

function showCodeGate() {
    codeInput.value = activeCode;
    codeGate.hidden = false;
    if (!activeCode) app.hidden = true;

    requestAnimationFrame(() => {
    codeInput.focus();
    codeInput.select();
    });
}

function hideCodeGate() {
    codeGate.hidden = true;
    app.hidden = false;
}

function setActiveCode(code, options = {}) {
    const nextCode = normalizeCode(code);

    if (!nextCode) {
    activeCode = "";
    showCodeGate();
    return;
    }

    const changed = nextCode !== activeCode;
    activeCode = nextCode;
    currentCode.textContent = activeCode;
    currentCode.parentElement.title = `Code hiện tại: ${activeCode}`;
    saveCodeCookie(activeCode);

    if (options.writeUrl !== false) {
    syncUrlCode(activeCode, options.pushUrl && changed ? "pushState" : "replaceState");
    }

    hideCodeGate();
    loadKeeps();
}

async function loadKeeps() {
    if (!activeCode) {
    showCodeGate();
    return;
    }

    try {
    const res = await fetch(notesUrl());
    if (!res.ok) throw new Error("Không tải được dữ liệu");

    const keeps = await res.json();
    updateCount(keeps.length);
    list.replaceChildren();

    if (!keeps.length) {
        renderEmpty("Chưa có ghi chú nào cho code này.");
        return;
    }

    keeps.forEach(renderNote);
    } catch (error) {
    updateCount(0);
    renderEmpty("Không thể tải ghi chú. Vui lòng thử lại.", "error");
    }
}

function renderNote(keep) {
    const card = document.createElement("article");
    card.className = "note-card";

    const image = String(keep.image ?? "");
    const preview = getNotePreview(keep.title);
    const hasText = Boolean(preview.text);

    if (image) {
    const noteImage = document.createElement("img");
    noteImage.className = "note-image";
    noteImage.src = image;
    noteImage.alt = "Ảnh ghi chú";
    card.append(noteImage);
    }

    if (hasText) {
    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = preview.text;
    card.append(text);
    }

    const footer = document.createElement("footer");
    footer.className = "note-footer";

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = formatDate(keep.created_at);

    const actions = document.createElement("div");
    actions.className = "note-actions";

    if (preview.isTruncated || image) {
    const moreButton = document.createElement("button");
    moreButton.className = "ghost-button";
    moreButton.type = "button";
    moreButton.textContent = preview.isTruncated ? "Xem thêm" : "Xem";
    moreButton.addEventListener("click", () => openNoteModal(keep));
    actions.append(moreButton);
    }

    if (hasText) {
    const copyButton = document.createElement("button");
    copyButton.className = "ghost-button";
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => copyText(keep.title, copyButton, "Đã copy"));
    actions.append(copyButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Xóa";
    deleteButton.addEventListener("click", () => deleteKeep(keep.id));

    actions.append(deleteButton);
    footer.append(date, actions);
    card.append(footer);
    list.append(card);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!activeCode) {
    showCodeGate();
    return;
    }

    if (imagePasteTask) {
    try {
        await imagePasteTask;
    } catch (error) {
        titleInput.focus();
        return;
    }
    }

    const title = titleInput.value.trim();
    if (!title && !pendingImage) {
    titleInput.focus();
    return;
    }

    const res = await fetch(notesUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, image: pendingImage, code: activeCode })
    });

    if (!res.ok) {
    renderEmpty("Không thể lưu ghi chú. Vui lòng thử lại.", "error");
    return;
    }

    titleInput.value = "";
    setPendingImage("");
    clearComposerError();
    resizeTextarea(titleInput);
    titleInput.focus();
    loadKeeps();
});

codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setActiveCode(codeInput.value, { pushUrl: Boolean(activeCode) });
});

changeCodeButton.addEventListener("click", showCodeGate);
copyLinkButton.addEventListener("click", () => copyText(window.location.href, copyLinkButton, "Đã copy"));
titleInput.addEventListener("input", () => resizeTextarea(titleInput));
titleInput.addEventListener("paste", handleTitlePaste);
removeImageButton.addEventListener("click", () => {
    imagePasteTask = null;
    setPendingImage("");
    clearComposerError();
    titleInput.focus();
});
closeNoteModalButton.addEventListener("click", closeNoteModal);
closeNoteModalFooterButton.addEventListener("click", closeNoteModal);
copyModalNoteButton.addEventListener("click", () => copyText(activeModalNote, copyModalNoteButton, "Đã copy"));
noteModal.addEventListener("click", (event) => {
    if (event.target === noteModal) closeNoteModal();
});

window.addEventListener("popstate", () => {
    const code = getUrlCode();
    if (code && code !== activeCode) setActiveCode(code, { writeUrl: false });
});

async function copyText(text, button, successText) {
    const originalText = button.textContent;

    try {
    await navigator.clipboard.writeText(text);
    button.textContent = successText;
    } catch (error) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
    button.textContent = successText;
    }

    setTimeout(() => {
    button.textContent = originalText;
    }, 1400);
}

async function deleteKeep(id) {
    await fetch(notesUrl(`/${id}`), {
    method: "DELETE"
    });

    loadKeeps();
}

function init() {
    resizeTextarea(titleInput);

    const urlCode = getUrlCode();
    const savedCode = normalizeCode(getCookie(CODE_COOKIE));

    if (urlCode) {
    setActiveCode(urlCode, { writeUrl: false });
    return;
    }

    if (savedCode) {
    setActiveCode(savedCode);
    return;
    }

    showCodeGate();
}

init();

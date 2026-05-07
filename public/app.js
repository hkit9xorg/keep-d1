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
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const list = document.querySelector("#list");
const count = document.querySelector("#count");
const searchInput = document.querySelector("#searchInput");
const codeGate = document.querySelector("#codeGate");
const codeForm = document.querySelector("#codeForm");
const codeInput = document.querySelector("#codeInput");
const currentCode = document.querySelector("#currentCode");
const codePill = document.querySelector(".code-pill");
const noteModal = document.querySelector("#noteModal");
const noteModalDate = document.querySelector("#noteModalDate");
const noteModalText = document.querySelector("#noteModalText");
const noteModalImage = document.querySelector("#noteModalImage");
const closeNoteModalButton = document.querySelector("#closeNoteModalButton");
const closeNoteModalFooterButton = document.querySelector("#closeNoteModalFooterButton");
const copyModalNoteButton = document.querySelector("#copyModalNoteButton");
const editModalNoteButton = document.querySelector("#editModalNoteButton");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});
let activeCode = "";
let activeModalNote = "";
let activeModalKeep = null;
let editingKeep = null;
let keepsCache = [];
let pendingImage = "";
let imagePasteTask = null;
let searchDebounce = null;
let undoDeleteTask = null;

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

function normalizeSearchValue(value) {
    return String(value ?? "").trim().toLowerCase();
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

const HTML_ESCAPE_LOOKUP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
};

const INLINE_MARKDOWN_PATTERN = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char]);
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function getSafeMarkdownUrl(value) {
    const rawUrl = String(value ?? "").trim().replace(/^<|>$/g, "");

    if (!rawUrl) return "";
    if (rawUrl.startsWith("#")) return rawUrl;
    if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) return rawUrl;
    if (/^\.\.?\//.test(rawUrl)) return rawUrl;

    try {
    const url = new URL(rawUrl, window.location.origin);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
        return url.href;
    }
    } catch (error) {
    return "";
    }

    return "";
}

function renderInlineMarkdown(value) {
    const text = String(value ?? "");
    const inlinePattern = new RegExp(INLINE_MARKDOWN_PATTERN.source, "g");
    let html = "";
    let cursor = 0;

    text.replace(inlinePattern, (...args) => {
    const match = args[0];
    const offset = args[args.length - 2];
    const [
        code,
        linkText,
        linkUrl,
        strongAsterisk,
        strongUnderscore,
        deleted,
        emphasisAsterisk,
        emphasisUnderscore
    ] = args.slice(1, -2);

    html += escapeHtml(text.slice(cursor, offset));
    cursor = offset + match.length;

    if (code !== undefined) {
        html += `<code>${escapeHtml(code)}</code>`;
        return match;
    }

    if (linkText !== undefined) {
        const safeUrl = getSafeMarkdownUrl(linkUrl);
        html += safeUrl
        ? `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(linkText)}</a>`
        : escapeHtml(match);
        return match;
    }

    const strongText = strongAsterisk ?? strongUnderscore;
    if (strongText !== undefined) {
        html += `<strong>${renderInlineMarkdown(strongText)}</strong>`;
        return match;
    }

    if (deleted !== undefined) {
        html += `<del>${renderInlineMarkdown(deleted)}</del>`;
        return match;
    }

    const emphasisText = emphasisAsterisk ?? emphasisUnderscore;
    if (emphasisText !== undefined) {
        html += `<em>${renderInlineMarkdown(emphasisText)}</em>`;
        return match;
    }

    html += escapeHtml(match);
    return match;
    });

    html += escapeHtml(text.slice(cursor));
    return html;
}

function renderInlineMarkdownWithBreaks(value) {
    return renderInlineMarkdown(value).replace(/\n/g, "<br>");
}

function isMarkdownBlockStart(line) {
    return /^ {0,3}```/.test(line)
    || /^ {0,3}#{1,6}\s+/.test(line)
    || /^ {0,3}(?:[-*_]\s*){3,}$/.test(line)
    || /^ {0,3}>\s?/.test(line)
    || /^ {0,3}(?:[-*+]|\d+[.)])\s+/.test(line);
}

function renderListItemMarkdown(value) {
    const taskMatch = String(value ?? "").match(/^\[( |x|X)\]\s+([\s\S]*)$/);

    if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === "x" ? " checked" : "";
    return `<li class="task-list-item"><input type="checkbox" disabled${checked}>${renderInlineMarkdownWithBreaks(taskMatch[2])}</li>`;
    }

    return `<li>${renderInlineMarkdownWithBreaks(value)}</li>`;
}

function renderMarkdown(value) {
    const source = String(value ?? "").replace(/\r\n?/g, "\n").trimEnd();

    if (!source.trim()) return "";

    const lines = source.split("\n");
    const html = [];
    let index = 0;

    while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
        index += 1;
        continue;
    }

    const fence = line.match(/^ {0,3}```\s*([\w-]+)?\s*$/);
    if (fence) {
        const codeLines = [];
        index += 1;

        while (index < lines.length && !/^ {0,3}```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
        }

        if (index < lines.length) index += 1;

        const language = fence[1] ? ` class="language-${escapeAttribute(fence[1])}"` : "";
        html.push(`<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        index += 1;
        continue;
    }

    if (/^ {0,3}(?:[-*_]\s*){3,}$/.test(line)) {
        html.push("<hr>");
        index += 1;
        continue;
    }

    if (/^ {0,3}>\s?/.test(line)) {
        const quoteLines = [];

        while (index < lines.length) {
        const quote = lines[index].match(/^ {0,3}>\s?(.*)$/);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
        }

        html.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
        continue;
    }

    const unordered = line.match(/^ {0,3}[-*+]\s+(.+)$/);
    const ordered = line.match(/^ {0,3}\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
        const isOrdered = Boolean(ordered);
        const itemPattern = isOrdered ? /^ {0,3}\d+[.)]\s+(.+)$/ : /^ {0,3}[-*+]\s+(.+)$/;
        const items = [];

        while (index < lines.length) {
        const item = lines[index].match(itemPattern);
        if (!item) break;
        let itemText = item[1];
        index += 1;

        while (index < lines.length && /^ {2,}\S/.test(lines[index]) && !isMarkdownBlockStart(lines[index])) {
            itemText += `\n${lines[index].trim()}`;
            index += 1;
        }

        items.push(renderListItemMarkdown(itemText));
        }

        html.push(`<${isOrdered ? "ol" : "ul"}>${items.join("")}</${isOrdered ? "ol" : "ul"}>`);
        continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
        paragraphLines.push(lines[index]);
        index += 1;
    }

    if (paragraphLines.length) {
        html.push(`<p>${renderInlineMarkdownWithBreaks(paragraphLines.join("\n"))}</p>`);
        continue;
    }

    html.push(`<p>${renderInlineMarkdownWithBreaks(line)}</p>`);
    index += 1;
    }

    return html.join("");
}

function renderMarkdownInto(element, value) {
    const html = renderMarkdown(value);
    element.innerHTML = html;
    element.hidden = !html;
}

function openNoteModal(keep) {
    const dateText = formatDate(keep.created_at);
    const image = String(keep.image ?? "");
    activeModalNote = String(keep.title ?? "");
    activeModalKeep = keep;
    renderMarkdownInto(noteModalText, activeModalNote);
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

function resetComposer(options = {}) {
    editingKeep = null;
    imagePasteTask = null;
    titleInput.value = "";
    setPendingImage("");
    clearComposerError();
    resizeTextarea(titleInput);
    form.classList.remove("is-editing");
    saveButton.textContent = "Lưu ghi chú";
    cancelEditButton.hidden = true;

    if (options.focus !== false) {
    titleInput.focus();
    }
}

function startEditKeep(keep) {
    editingKeep = {
    id: keep.id,
    completed: keep.completed ? 1 : 0
    };
    imagePasteTask = null;
    titleInput.value = String(keep.title ?? "");
    setPendingImage(String(keep.image ?? ""));
    clearComposerError();
    resizeTextarea(titleInput);
    form.classList.add("is-editing");
    saveButton.textContent = "Cập nhật";
    cancelEditButton.hidden = false;
    closeNoteModal();
    form.scrollIntoView({ block: "start", behavior: "smooth" });

    requestAnimationFrame(() => {
    titleInput.focus();
    titleInput.selectionStart = titleInput.value.length;
    titleInput.selectionEnd = titleInput.value.length;
    });
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

    if (changed) {
    resetComposer({ focus: false });
    }

    currentCode.textContent = activeCode;
    currentCode.parentElement.title = `Code hiện tại: ${activeCode}`;
    saveCodeCookie(activeCode);

    if (options.writeUrl !== false) {
    syncUrlCode(activeCode, options.pushUrl && changed ? "pushState" : "replaceState");
    }

    hideCodeGate();
    loadKeeps();
}

function getFilteredKeeps() {
    const query = normalizeSearchValue(searchInput.value);
    if (!query) return keepsCache;
    return keepsCache.filter((keep) => String(keep.title ?? "").toLowerCase().includes(query));
}

function renderKeeps() {
    const filteredKeeps = getFilteredKeeps();
    updateCount(filteredKeeps.length);
    list.replaceChildren();

    if (!filteredKeeps.length) {
    renderEmpty(keepsCache.length ? "Không tìm thấy ghi chú phù hợp." : "Chưa có ghi chú nào cho code này.");
    return;
    }

    filteredKeeps.forEach(renderNote);
}

function showUndoDelete(keep) {
    if (undoDeleteTask) undoDeleteTask.remove();
    const toast = document.createElement("div");
    toast.className = "undo-toast";
    toast.innerHTML = `<span>Đã xóa ghi chú.</span><button type="button" class="ghost-button">Hoàn tác</button>`;
    document.body.append(toast);
    const undoButton = toast.querySelector("button");
    const timer = setTimeout(() => toast.remove(), 5000);
    undoButton.addEventListener("click", async () => {
    clearTimeout(timer);
    toast.remove();
    await fetch(notesUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: keep.title, image: keep.image, code: activeCode })
    });
    loadKeeps();
    });
    undoDeleteTask = toast;
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
    keepsCache = keeps;
    renderKeeps();
    } catch (error) {
    keepsCache = [];
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
    const text = document.createElement("div");
    text.className = "note-text markdown-body";
    text.innerHTML = renderMarkdown(preview.text);
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
    moreButton.className = "icon-button";
    moreButton.type = "button";
    moreButton.innerHTML = "👁";
    moreButton.title = "Xem chi tiết";
    moreButton.setAttribute("aria-label", "Xem chi tiết");
    moreButton.addEventListener("click", () => openNoteModal(keep));
    actions.append(moreButton);
    }

    const editButton = document.createElement("button");
    editButton.className = "icon-button";
    editButton.type = "button";
    editButton.innerHTML = "✏️";
    editButton.title = "Sửa";
    editButton.setAttribute("aria-label", "Sửa");
    editButton.addEventListener("click", () => startEditKeep(keep));
    actions.append(editButton);

    if (hasText) {
    const copyButton = document.createElement("button");
    copyButton.className = "icon-button";
    copyButton.type = "button";
    copyButton.innerHTML = "📋";
    copyButton.title = "Copy";
    copyButton.setAttribute("aria-label", "Copy");
    copyButton.addEventListener("click", () => copyText(keep.title, copyButton, "Đã copy"));
    actions.append(copyButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button danger-button";
    deleteButton.type = "button";
    deleteButton.innerHTML = "🗑";
    deleteButton.title = "Xóa";
    deleteButton.setAttribute("aria-label", "Xóa");
    deleteButton.addEventListener("click", () => deleteKeep(keep));

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

    const requestPath = editingKeep ? `/${editingKeep.id}` : "";
    const res = await fetch(notesUrl(requestPath), {
    method: editingKeep ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        title,
        image: pendingImage,
        code: activeCode,
        completed: editingKeep?.completed ?? 0
    })
    });

    if (!res.ok) {
    setComposerError(editingKeep ? "Không thể cập nhật ghi chú. Vui lòng thử lại." : "Không thể lưu ghi chú. Vui lòng thử lại.");
    return;
    }

    resetComposer();
    loadKeeps();
});

codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setActiveCode(codeInput.value, { pushUrl: Boolean(activeCode) });
});

titleInput.addEventListener("input", () => resizeTextarea(titleInput));
searchInput.addEventListener("input", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderKeeps, 280);
});
titleInput.addEventListener("paste", handleTitlePaste);
cancelEditButton.addEventListener("click", () => resetComposer());
removeImageButton.addEventListener("click", () => {
    imagePasteTask = null;
    setPendingImage("");
    clearComposerError();
    titleInput.focus();
});
codePill.addEventListener("click", showCodeGate);
closeNoteModalButton.addEventListener("click", closeNoteModal);
closeNoteModalFooterButton.addEventListener("click", closeNoteModal);
copyModalNoteButton.addEventListener("click", () => copyText(activeModalNote, copyModalNoteButton, "Đã copy"));
editModalNoteButton.addEventListener("click", () => {
    if (activeModalKeep) startEditKeep(activeModalKeep);
});
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

async function deleteKeep(keep) {
    await fetch(notesUrl(`/${keep.id}`), {
    method: "DELETE"
    });

    if (editingKeep?.id === keep.id) {
    resetComposer({ focus: false });
    }

    showUndoDelete(keep);
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

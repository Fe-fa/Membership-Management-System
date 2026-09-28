import { isCompleteEndorsement, pickActiveEndorsement } from "@/components/admin/ManagerStagePanel";
import { parseApplicationDraft } from "@/components/panels/ApplicantReview";
import { readToken } from "@/lib/auth";
import {
  DOCUMENT_TYPE_LABEL,
  applicantDisplayName,
  applicationReference,
  type ApplicationDetailAdmin,
  type ApplicationRow,
} from "@/services/admin/membershipDesk";
import { API_BASE } from "@/services/membership/api";
import type { ApplicationDraft } from "@/services/membership/schema";
import { printHtmlDocument } from "@/utils/financeExport";

type EmbeddedFile = {
  label: string;
  fileName: string;
  mime: string;
  dataUrl: string;
  text?: string;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textOf(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function line(label: string, value: unknown) {
  return `<tr><th>${esc(label)}</th><td>${esc(textOf(value))}</td></tr>`;
}

function yesNo(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

function resolveUrl(url?: string | null) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE}${path}`;
}

function extensionOf(fileName?: string | null, url?: string | null) {
  const source = `${fileName ?? ""} ${url ?? ""}`.split("?")[0] ?? "";
  const match = source.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function isImageName(fileName?: string | null, url?: string | null) {
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"].includes(extensionOf(fileName, url));
}

function isCvDoc(doc: { label: string; fileName: string; typeId?: number | undefined }) {
  const label = `${doc.label} ${doc.fileName}`.toLowerCase();
  return doc.typeId === 2 || /\bcv\b|curriculum|resume/.test(label);
}

function mimeFor(fileName: string, url: string, blobType: string) {
  if (blobType.startsWith("image/") || blobType === "application/pdf") return blobType;
  const ext = extensionOf(fileName, url);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  return blobType || "application/octet-stream";
}

async function readBlob(url: string) {
  const token = readToken();
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!res.ok) return null;
  return res.blob();
}

function blobToDataUrl(blob: Blob, mime: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const payload = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : "";
      resolve(payload ? `data:${mime};base64,${payload}` : "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function unzipEntry(buffer: ArrayBuffer, wanted: string) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (name.replace(/\\/g, "/") === wanted) {
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return compressed;
      if (method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return null;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function docxXmlToText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function embedUpload(label: string, fileName: string, url: string): Promise<EmbeddedFile | null> {
  const blob = await readBlob(url);
  if (!blob) return null;
  const mime = mimeFor(fileName, url, blob.type);
  const dataUrl = await blobToDataUrl(blob, mime);
  if (!dataUrl) return null;
  let text = "";
  if (extensionOf(fileName, url) === "docx" || mime.includes("wordprocessingml")) {
    const xmlBytes = await unzipEntry(await blob.arrayBuffer(), "word/document.xml").catch(() => null);
    if (xmlBytes) text = docxXmlToText(new TextDecoder().decode(xmlBytes));
  }
  return { label, fileName, mime, dataUrl, text };
}

function fileCards(files: EmbeddedFile[], empty: string) {
  if (files.length === 0) return `<p>${esc(empty)}</p>`;
  return files
    .map((file) => {
      if (file.mime.startsWith("image/")) {
        return `<figure><figcaption>${esc(file.label)} — ${esc(file.fileName)}</figcaption><img src="${file.dataUrl}" alt="${esc(file.label)}" /></figure>`;
      }
      if (file.mime === "application/pdf") {
        return `<figure class="wide"><figcaption>${esc(file.label)} — ${esc(file.fileName)}</figcaption><object data="${file.dataUrl}" type="application/pdf"></object></figure>`;
      }
      const body = file.text
        ? `<pre>${esc(file.text)}</pre>`
        : `<p>This file is attached below.</p>`;
      return `<article><h3>${esc(file.label)}</h3><p class="file">${esc(file.fileName)}</p>${body}<p><a download="${esc(file.fileName)}" href="${file.dataUrl}">Download ${esc(file.fileName)}</a></p></article>`;
    })
    .join("");
}

function initialsOf(name: string, fallback: string) {
  const letters = (name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "—";
}

function supporterCard(
  title: string,
  endorsement: NonNullable<ApplicationDetailAdmin["endorsements"]>[number] | null | undefined,
  fallback: ApplicationDraft["supporters"]["proposer"] | undefined,
  fallbackName?: string | null,
) {
  const name = (endorsement?.endorserName || fallbackName || fallback?.name || "").trim();
  const membershipNo = endorsement?.endorserMembershipNo || fallback?.membershipNo || "—";
  const years = endorsement?.yearsKnownCandidate;
  const known = years != null ? ` · known ${years} yrs` : "";
  const complete = isCompleteEndorsement(endorsement);
  const recommendation = complete
    ? `<h3>Personal knowledge</h3>
    <p>${esc(endorsement?.personalKnowledge)}</p>
    <h3>Professional knowledge</h3>
    <p>${esc(endorsement?.professionalKnowledge)}</p>
    <h3>Value to the club</h3>
    <p>${esc(endorsement?.valueAddition)}</p>`
    : `<p class="empty">No recommendation on file yet.</p>`;
  return `<article class="card">
    <div class="head">
      <div class="avatar">${esc(initialsOf(name, title))}</div>
      <div>
        <p class="who">${esc(name || "—")}</p>
        <p class="role">${esc(title.toUpperCase())}</p>
        <p class="idline">Member ID: ${esc(membershipNo)}${esc(known)}</p>
      </div>
    </div>
    ${recommendation}
  </article>`;
}

function collectSources(detail: ApplicationDetailAdmin, draft: ApplicationDraft) {
  const sources: { label: string; fileName: string; url: string; typeId?: number | undefined }[] = [];
  const seen = new Set<string>();
  const push = (
    label: string,
    file: { fileName?: string | undefined; url?: string | undefined } | null | undefined,
    typeId?: number | undefined,
  ) => {
    const url = resolveUrl(file?.url);
    const fileName = file?.fileName || label;
    const key = (url || fileName).toLowerCase();
    if (!url || seen.has(key)) return;
    seen.add(key);
    sources.push({ label, fileName, url, typeId });
  };
  for (const doc of detail.documents ?? []) {
    push(doc.documentTypeName || DOCUMENT_TYPE_LABEL[doc.documentTypeId] || doc.fileName, doc, doc.documentTypeId);
  }
  const personal = draft.personal;
  push("Passport photo", personal.photo, 1);
  push("Curriculum vitae", personal.cv, 2);
  push("ID / Passport copy", personal.idPassport);
  push("Annual subscription cheque", personal.annualCheque);
  push("Joining / entrance fee cheque", personal.joiningCheque);
  push("Pilot licence", draft.aviation.licenseFile);
  return sources;
}

export async function buildManagerReviewHtml(row: ApplicationRow, detail: ApplicationDetailAdmin) {
  const draft = parseApplicationDraft(detail.formDataJson);
  const personal = draft.personal;
  const family = draft.family;
  const aviation = draft.aviation;
  const name =
    [personal?.firstName, personal?.middleName, personal?.lastName].filter(Boolean).join(" ") ||
    applicantDisplayName(row);
  const email = personal?.email || "";
  const mobile = [personal?.telPrefix, personal?.mobile].filter(Boolean).join(" ");
  const sources = collectSources(detail, draft);
  const embedded: EmbeddedFile[] = [];
  for (const source of sources) {
    const file = await embedUpload(source.label, source.fileName, source.url).catch(() => null);
    if (file) embedded.push(file);
    else embedded.push({ label: source.label, fileName: source.fileName, mime: "", dataUrl: "" });
  }

  const photo = embedded.find(
    (file) => file.mime.startsWith("image/") && /passport photo/i.test(file.label),
  );
  const cvFiles = embedded.filter((file) =>
    isCvDoc({ label: file.label, fileName: file.fileName, typeId: sources.find((s) => s.fileName === file.fileName)?.typeId }),
  );
  const imageFiles = embedded.filter(
    (file) => file.mime.startsWith("image/") && !cvFiles.includes(file),
  );
  const otherNonCv = embedded.filter(
    (file) => !file.mime.startsWith("image/") && !cvFiles.includes(file) && file.dataUrl,
  );

  const spouses = (family?.spouses ?? [])
    .filter((spouse) => spouse?.name || spouse?.phone || spouse?.email)
    .map((spouse, index) => line(`Spouse ${index + 1}`, [spouse.name, spouse.phone, spouse.email].filter(Boolean).join(" · ")))
    .join("");
  const children = (family?.children ?? [])
    .filter((child) => child?.name || child?.dateOfBirth)
    .map((child, index) => line(`Child ${index + 1}`, [child.name, child.dateOfBirth].filter(Boolean).join(" · ")))
    .join("");
  const emergency = (family?.emergencyContacts ?? [])
    .map((contact, index) =>
      line(`Emergency contact ${index + 1}`, [contact?.name, contact?.phone, contact?.email].filter(Boolean).join(" · ")),
    )
    .join("");
  const clubs = (draft.clubs?.otherClubs ?? [])
    .map((club) => club?.name)
    .filter(Boolean)
    .join(", ");
  const payments = row.paymentLines ?? [];
  const endorsements = detail.endorsements ?? [];
  const proposer = pickActiveEndorsement(endorsements, "PROPOSER", detail.proposerProfileId);
  const seconder = pickActiveEndorsement(endorsements, "SECONDER", detail.seconderProfileId);

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${esc(applicationReference(row))}</title>
<style>
  html, body { background: #ffffff; color: #1c1917; color-scheme: light; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; }
  .page { padding: 28px 32px 40px; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #d6d3d1; padding-bottom: 4px; }
  h3 { font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #57534e; margin: 14px 0 4px; }
  .meta { color: #57534e; margin: 0 0 16px; }
  .split { display: flex; gap: 20px; align-items: flex-start; }
  .photo { width: 160px; flex: 0 0 160px; }
  .photo img { width: 160px; height: 200px; object-fit: cover; border: 1px solid #e7e5e4; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #e7e5e4; font-size: 14px; }
  th { width: 32%; color: #57534e; font-weight: 600; }
  .cards { display: flex; gap: 16px; align-items: stretch; }
  .card { flex: 1; border: 1px solid #e7e5e4; border-radius: 16px; padding: 18px 16px; background: #fff; font-family: "Segoe UI", Arial, sans-serif; }
  .head { display: flex; gap: 12px; align-items: flex-start; }
  .avatar { width: 40px; height: 40px; border-radius: 999px; background: #f5f5f4; color: #44403c; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: 0 0 40px; }
  .who { font-size: 18px; font-weight: 700; margin: 0; line-height: 1.2; }
  .role { color: #78716c; margin: 2px 0 0; font-size: 11px; letter-spacing: 0.08em; font-weight: 700; }
  .idline { color: #78716c; margin: 4px 0 0; font-size: 13px; }
  .card h3 { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #78716c; margin: 16px 0 4px; }
  .card p { white-space: pre-wrap; font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; line-height: 1.45; margin: 0; color: #1c1917; }
  .empty { color: #78716c; margin-top: 16px; }
  img { max-width: 100%; max-height: 420px; object-fit: contain; border: 1px solid #e7e5e4; }
  figure { margin: 0 0 18px; }
  figcaption, .file { font-size: 12px; color: #57534e; margin-bottom: 6px; }
  object, iframe { width: 100%; height: 900px; border: 1px solid #e7e5e4; }
  pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; line-height: 1.45; }
  @media print { .page { min-height: 100vh; } }
</style></head><body>
<section class="page">
  <h1>Application details</h1>
  <p class="meta">${esc(applicationReference(row))} · ${esc(row.membershipTypeName || draft.membership?.membershipType || "Country Membership")}</p>
  <div class="split">
    <div class="photo">
      <p class="file">Passport photo</p>
      ${photo?.dataUrl ? `<img src="${photo.dataUrl}" alt="Passport photo" />` : "<p>Passport photo was not available to embed.</p>"}
    </div>
    <table>
      ${line("First name", personal?.firstName)}
      ${line("Middle name", personal?.middleName)}
      ${line("Last name", personal?.lastName)}
      ${line("Email", email)}
      ${line("Alternate email", personal?.altEmail)}
      ${line("Mobile", mobile)}
      ${line("Other telephone", personal?.telOther)}
      ${line("ID or passport number", personal?.idPassportNo)}
      ${line("Nationality", personal?.nationality)}
      ${line("Date of birth", personal?.dateOfBirth)}
      ${line("Place of birth", personal?.placeOfBirth)}
      ${line("City", personal?.city)}
      ${line("Postal address", personal?.postalAddress)}
      ${line("Postal code", personal?.postalCode)}
      ${line("State / region", personal?.stateCountry)}
      ${line("Country", personal?.countryOfResidence || personal?.country)}
      ${line("Occupation", personal?.occupation)}
      ${line("Company", personal?.company)}
      ${line("Designation", personal?.role)}
      ${line("Next of kin", personal?.nextOfKinName)}
      ${line("Next of kin relationship", personal?.nextOfKinRelationship)}
      ${line("Next of kin phone", personal?.nextOfKinPhone)}
      ${line("Next of kin email", personal?.nextOfKinEmail)}
      ${line("Gender", personal?.gender)}
      ${line("Blood group", personal?.bloodGroup)}
      ${line("Membership applied for", row.membershipTypeName || draft.membership?.membershipType)}
      ${line("Status", row.managerStagePending ? "Pending — manager review" : row.statusName || row.statusCode)}
      ${line("Applicant signature", draft.membership?.applicantSignature)}
      ${line("Signature date", draft.membership?.signatureDate)}
    </table>
  </div>
  <h2>Family and emergency contact</h2>
  <table>
    ${line("Married", yesNo(family?.isMarried))}
    ${spouses || line("Spouse", "—")}
    ${line("Has children", yesNo(family?.hasChildren))}
    ${children || line("Children", "—")}
    ${emergency || line("Emergency contact", "—")}
  </table>
  <h2>Aviation affiliation and aircraft</h2>
  <table>
    ${line("Affiliated", yesNo(aviation?.isAffiliated))}
    ${line("Aviation role", aviation?.aviationRole)}
    ${line("Holds a licence", yesNo(aviation?.holdsLicense))}
    ${line("Licence type", aviation?.licenseType)}
    ${line("Licence number", aviation?.licenseNumber)}
    ${line("Issuer", aviation?.licenseIssuer)}
    ${line("Owns aircraft", yesNo(aviation?.ownsAircraft))}
    ${line("Aircraft type", aviation?.aircraftType)}
    ${line("Registration", aviation?.aircraftRegistration)}
    ${line("Hangar", aviation?.hangarLocation)}
  </table>
  <h2>Other clubs and declaration</h2>
  <table>
    ${line("Member of another club", yesNo(draft.clubs?.memberOfOtherClub))}
    ${line("Other clubs", clubs)}
    ${line("Privacy policy accepted", yesNo(draft.consent?.privacyPolicyAccepted === true))}
    ${line("Declaration accepted", yesNo(draft.consent?.declarationAccepted === true))}
    ${line("Declaration name", draft.consent?.declarationName)}
    ${line("Declaration signature", draft.consent?.declarationSignature)}
    ${line("Declaration date", draft.consent?.declarationDate)}
    ${line("Club visits recorded", detail.clubVisitsCount)}
  </table>
  <h2>Payment details</h2>
  <table>
    ${payments.length === 0 ? line("Payments", row.paymentStatus || "No payment lines on file") : ""}
    ${payments
      .map((payment) =>
        line(
          payment.feeLabel || payment.feeCode || "Fee",
          `${payment.amount ?? ""} · ${payment.status || ""} · ${payment.receiptNumber || "no receipt"}`,
        ),
      )
      .join("")}
    ${line("Payment status", row.paymentStatus)}
  </table>
</section>
<section class="page">
  <h1>Proposer &amp; seconder details</h1>
  <p class="meta">Full recommendations from the named proposer and seconder.</p>
  <div class="cards">
    ${supporterCard("Proposer", proposer, draft.supporters?.proposer, detail.proposerName)}
    ${supporterCard("Seconder", seconder, draft.supporters?.seconder, detail.seconderName)}
  </div>
</section>
<section class="page">
  <h1>Uploaded images</h1>
  <p class="meta">${esc(name)} · ${esc(email)}</p>
  ${fileCards([...imageFiles, ...otherNonCv.filter((file) => file.mime === "application/pdf")], "No uploaded images on file.")}
</section>
<section class="page">
  <h1>Curriculum vitae</h1>
  <p class="meta">${esc(name)} · ${esc(email)}</p>
  ${fileCards(cvFiles, "No curriculum vitae on file.")}
</section>
</body></html>`;
}

function pdfDataUrls(html: string) {
  return [...new Set(html.match(/data:application\/pdf;base64,[A-Za-z0-9+/=]+/g) ?? [])];
}

function dataUrlToBytes(dataUrl: string) {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function appendUploadedPdfs(pdfBlob: Blob, dataUrls: string[]) {
  if (dataUrls.length === 0) return pdfBlob;
  const { PDFDocument } = await import("pdf-lib");
  const main = await PDFDocument.load(await pdfBlob.arrayBuffer());
  for (const dataUrl of dataUrls) {
    try {
      const source = await PDFDocument.load(dataUrlToBytes(dataUrl), { ignoreEncryption: true });
      const pages = await main.copyPages(source, source.getPageIndices());
      pages.forEach((page) => main.addPage(page));
    } catch {
      /* Unreadable uploads stay described in the pack body. */
    }
  }
  const saved = await main.save();
  return new Blob([saved.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

async function renderReviewPdf(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Review pack");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "0";
  iframe.style.top = "0";
  iframe.style.width = "820px";
  iframe.style.height = "400px";
  iframe.style.border = "0";
  iframe.style.zIndex = "-1";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  try {
    const frameDoc = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!frameDoc || !frameWindow) throw new Error("Could not prepare the PDF.");
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    frameDoc.querySelectorAll("object, iframe").forEach((node) => {
      const note = frameDoc.createElement("p");
      note.textContent = "This PDF is included at the end of the downloaded pack.";
      node.replaceWith(note);
    });
    const images = Array.from(frameDoc.images);
    await Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve())));
    iframe.style.height = `${Math.max(frameDoc.body.scrollHeight, 400)}px`;

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const sections = Array.from(frameDoc.querySelectorAll<HTMLElement>(".page"));
    const targets = sections.length > 0 ? sections : [frameDoc.body];
    let placed = false;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (const section of targets) {
      const scale = section.scrollHeight > 7000 ? 1 : 2;
      const canvas = await html2canvas(section, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: 820,
      });
      const slicePx = Math.max(1, Math.floor((pageHeight / pageWidth) * canvas.width));
      let offset = 0;
      while (offset < canvas.height) {
        const sliceHeight = Math.min(slicePx, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (placed) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, sliceHeight * (pageWidth / canvas.width));
        placed = true;
        offset += sliceHeight;
      }
    }

    return appendUploadedPdfs(pdf.output("blob"), pdfDataUrls(html));
  } finally {
    iframe.remove();
  }
}

export async function printManagerReview(row: ApplicationRow, detail: ApplicationDetailAdmin) {
  const html = await buildManagerReviewHtml(row, detail);
  return printHtmlDocument(html);
}

export async function downloadManagerReview(row: ApplicationRow, detail: ApplicationDetailAdmin) {
  const html = await buildManagerReviewHtml(row, detail);
  const blob = await renderReviewPdf(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${applicationReference(row)}-manager-review.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

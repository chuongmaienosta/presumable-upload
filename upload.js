const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const FILE_PATH = "./temp_1GB_file"; // <== change this to your file
const BACKEND_URL = "https://genorare.enosta.com/api/v1/upload/common";

const TOKEN =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJHZW5vcmFyZS1BUEktQWNjZXNzLVByb3ZpZGVyIiwic3ViIjoiMzhhMzBlZDItOTA0MC00NzAyLTg3OTYtNzIwODUzNDhlMGFkIiwiZXhwIjoxNzUxNTMwNzM1LCJpYXQiOjE3NTE1MjcxMzUsImp0aSI6IjRlNDEwZTI1LTgyZTMtNDQ4ZS05MjI2LThjYzNhNTUzNTk2MSJ9.GihmENuKKrG5BzGx-e9IHj-Cb5pTZIOvRiRA1WVKPbg"; // <== replace with your token

async function getUploadUrlFromBackend(fileType, fileName) {
  console.log(
    "Requesting upload URL for file:",
    fileType,
    "---",
    fileName,
    "--",
    JSON.stringify({ fileType, orgName: fileName, resumable: true })
  );
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
    },
    body: JSON.stringify({ fileType, orgName: fileName, resumable: true }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get upload URL: ${await res.text()}`);
  }

  const data = await res.json();
  return data.data.postUrl;
}

async function startResumableSession(uploadUrl, fileType, fileName) {
  try {
    const headers = {
      "x-goog-resumable": "start",
      host: "storage.googleapis.com",
      "x-goog-meta-filename": fileName,
      "x-goog-meta-id": "38a30ed2-9040-4702-8796-72085348e0ad",
      "Content-Type": fileType || "application/octet-stream",
    };

    console.log("Starting resumable session with headers:", headers);
    console.log("uploadUrl", uploadUrl, fileType, fileName);
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers,
    });

    console.log("Response status:", res);
    console.log("Response status:", res.status);
    console.log("Response headers:", [...res.headers.entries()]);
    const errorText = await res.text();
    console.error("Error body:", errorText);

    return res.headers.get("location");
  } catch (err) {
    console.error("Error starting resumable session:", err);
    throw new Error("Failed to start resumable session");
  }
}

async function uploadChunks(filePath, sessionUrl) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;

  console.log(`Total file size: ${totalSize} bytes`);

  const file = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
  let offset = 0;
  let part = 0;

  for await (const chunk of file) {
    const start = offset;
    const end = offset + chunk.length - 1;
    const contentRange = `bytes ${start}-${end}/${totalSize}`;

    console.log(
      `Uploading chunk ${part + 1} (${
        chunk.length
      } bytes) at range: ${contentRange}`
    );

    console.log("Session URL:", sessionUrl);

    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Range": contentRange,
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    });

    if (![200, 308].includes(res.status)) {
      throw new Error(`Chunk upload failed at ${contentRange}`);
    }

    offset += chunk.length;
    part++;
    console.log(
      `✔️ Uploaded chunk ${part}, Progress: ${(
        (offset / totalSize) *
        100
      ).toFixed(2)}%`
    );
  }
}

async function checkUploadStatus(sessionUrl) {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Range": "bytes */*",
      "Content-Type": "application/octet-stream",
    },
  });
  console.log("Checking upload status:", res.headers);
  if (res.status === 200) {
    console.log("Upload completed successfully!");
  }
  if (res.status === 308) {
    console.log(
      "Upload is still in progress, please continue uploading chunks."
    );
  }
  if (res.status === 404) {
    console.error("Upload session not found. Please start a new session.");
  }
  if (res.status >= 400) {
    const errorText = await res.text();
    console.error("Error checking upload status:", errorText);
  }
}

async function resumeInterruptedUpload(uploadUrl, fileType, fileName) {
  try {
    const sessionUrl = await startResumableSession(
      uploadUrl,
      fileType,
      fileName
    );
    console.log("Resuming upload session at:", sessionUrl);
  } catch (err) {
    console.error("Error resuming upload:", err);
    throw new Error("Failed to resume upload session");
  }
}

(async () => {
  try {
    // const fileType = "application/x-gzip"; // <== change if needed
    // const fileName = path.basename(FILE_PATH);

    // console.log("📦 Getting upload URL...", fileName);

    // const uploadUrl = await getUploadUrlFromBackend(fileType, fileName);

    // console.log("🚀 Starting resumable upload session...");
    // const sessionUrl = await startResumableSession(
    //   uploadUrl,
    //   fileType,
    //   fileName
    // );

    // console.log("📤 Uploading chunks...");
    // await uploadChunks(FILE_PATH, sessionUrl);

    // console.log("✅ Upload complete!");

    console.log("🔍 Checking upload status...");
    await checkUploadStatus(
      "https://storage.googleapis.com/genorare-dev-v2-hub-storage/upload/7c3665f7-0ca3-490e-a8bb-f534e3b4a9eb?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=hub-api-sa%40genorare-dev-v2.iam.gserviceaccount.com%2F20250703%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20250703T071918Z&X-Goog-Expires=599&X-Goog-Signature=34561410c290e97df791846e0694020b6ef27053cf1f8139b50d4135aac3d3b287e8664c7d9472e344536cea89f3057a598ec32a41d1dea10900a24a65e2af8eb8d75278f30dade05d0da8b8062529f8e3532519914f37b2fc846cac92044f3a99aa2bffa4cded94106425901461c75774e18b75de74a862e7e2669a4ac0ace9dd28366cfb96cd9fde0d8585c5069cbe7a11da6c3e97214108bbf0fd0d8e47a620bacca579da6e2506590a89ce21e6e32e377dbf5412fefaf8b460519cd92713ef32c03d2eba5035c39c290c9985fae3d0e6e351ec851771d3cc5ed8cec017903cd67a23ccfb1b064c8d5c5301abc691076a657425ed1fcf4b4cb5731205c4c5&X-Goog-SignedHeaders=content-type%3Bhost%3Bx-goog-meta-filename%3Bx-goog-meta-id%3Bx-goog-resumable&upload_id=ABgVH8_ORuahfS9hgcF9TYs0eB_AQTeqKGLWg8DUk1g8IbhNFk4vbqazCAG6FWizyRD6di6s30wV_9K8yvtzJBt-OXAESUC7PJHnqp-rZoSAWUMg"
    );
  } catch (err) {
    console.error("❌ Upload failed:", err.message);
  }
})();

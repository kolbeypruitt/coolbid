import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export type DocumentAiResult = {
  text: string;
  pages: { pageNumber: number; text: string }[];
};

let clientInstance: DocumentProcessorServiceClient | null = null;

function getClient(): DocumentProcessorServiceClient | null {
  if (clientInstance) return clientInstance;

  const credentialsB64 = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS?.trim();
  if (!credentialsB64) {
    console.warn("GOOGLE_DOCUMENT_AI_CREDENTIALS not set — Document AI disabled");
    return null;
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(credentialsB64, "base64").toString("utf-8")
    );
    clientInstance = new DocumentProcessorServiceClient({ credentials });
    return clientInstance;
  } catch (err) {
    console.error("Failed to parse Document AI credentials:", err);
    return null;
  }
}

export async function ocrDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<DocumentAiResult | null> {
  const client = getClient();
  if (!client) return null;

  const processorName = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim();
  if (!processorName) {
    console.warn("GOOGLE_DOCUMENT_AI_PROCESSOR_ID not set — Document AI disabled");
    return null;
  }

  try {
    const [response] = await client.processDocument({
      name: processorName,
      rawDocument: {
        content: fileBuffer.toString("base64"),
        mimeType,
      },
    });

    const document = response.document;
    if (!document?.text) {
      console.warn("Document AI returned empty text");
      return null;
    }

    const pages: DocumentAiResult["pages"] = (document.pages ?? []).map(
      (page, idx) => {
        const segments = (page.layout?.textAnchor?.textSegments ?? [])
          .map((seg) => {
            const start = Number(seg.startIndex ?? 0);
            const end = Number(seg.endIndex ?? 0);
            return document.text!.slice(start, end);
          });
        return {
          pageNumber: idx + 1,
          text: segments.join("") || "",
        };
      }
    );

    return { text: document.text, pages };
  } catch (err) {
    console.error("Document AI processing failed:", err);
    return null;
  }
}

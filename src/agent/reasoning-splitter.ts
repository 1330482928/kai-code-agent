export type ReasoningPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; hidden: true };

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

export class StreamingReasoningSplitter {
  private buffer = "";
  private insideThinking = false;

  push(chunk: string): ReasoningPart[] {
    if (chunk.length === 0) {
      return [];
    }
    this.buffer += chunk;
    return this.drain(false);
  }

  flush(): ReasoningPart[] {
    return this.drain(true);
  }

  private drain(final: boolean): ReasoningPart[] {
    const parts: ReasoningPart[] = [];

    while (this.buffer.length > 0) {
      if (this.insideThinking) {
        const closeIndex = indexOfIgnoreCase(this.buffer, CLOSE_TAG);
        if (closeIndex >= 0) {
          pushPart(parts, "thinking", this.buffer.slice(0, closeIndex));
          this.buffer = this.buffer.slice(closeIndex + CLOSE_TAG.length);
          this.insideThinking = false;
          continue;
        }

        const holdLength = final ? 0 : trailingPrefixLength(this.buffer, CLOSE_TAG);
        const emitLength = this.buffer.length - holdLength;
        if (emitLength > 0) {
          pushPart(parts, "thinking", this.buffer.slice(0, emitLength));
          this.buffer = this.buffer.slice(emitLength);
          continue;
        }
        break;
      }

      const openIndex = indexOfIgnoreCase(this.buffer, OPEN_TAG);
      if (openIndex >= 0) {
        pushPart(parts, "text", this.buffer.slice(0, openIndex));
        this.buffer = this.buffer.slice(openIndex + OPEN_TAG.length);
        this.insideThinking = true;
        continue;
      }

      if (final && isPrefixOfIgnoreCase(this.buffer, OPEN_TAG)) {
        break;
      }
      const holdLength = final ? 0 : trailingPrefixLength(this.buffer, OPEN_TAG);
      const emitLength = this.buffer.length - holdLength;
      if (emitLength > 0) {
        pushPart(parts, "text", this.buffer.slice(0, emitLength));
        this.buffer = this.buffer.slice(emitLength);
        continue;
      }
      break;
    }

    if (final && this.buffer.length > 0) {
      pushPart(parts, this.insideThinking || isPrefixOfIgnoreCase(this.buffer, OPEN_TAG) ? "thinking" : "text", this.buffer);
      this.buffer = "";
    }
    if (final) {
      this.insideThinking = false;
    }

    return parts;
  }
}

export function splitReasoningParts(text: string): ReasoningPart[] {
  const splitter = new StreamingReasoningSplitter();
  return [
    ...splitter.push(text),
    ...splitter.flush(),
  ];
}

function pushPart(parts: ReasoningPart[], type: "text" | "thinking", text: string): void {
  if (text.length === 0) {
    return;
  }
  if (type === "thinking") {
    parts.push({ type: "thinking", text, hidden: true });
    return;
  }
  parts.push({ type: "text", text });
}

function indexOfIgnoreCase(text: string, search: string): number {
  return text.toLowerCase().indexOf(search.toLowerCase());
}

function trailingPrefixLength(text: string, tag: string): number {
  const maxLength = Math.min(text.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (isPrefixOfIgnoreCase(text.slice(text.length - length), tag)) {
      return length;
    }
  }
  return 0;
}

function isPrefixOfIgnoreCase(value: string, target: string): boolean {
  return target.toLowerCase().startsWith(value.toLowerCase());
}

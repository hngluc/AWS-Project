import type {
  DetectLabelsResponse,
  DetectModerationLabelsResponse,
} from '@aws-sdk/client-rekognition';

/**
 * Tag Mapper — Transforms Rekognition API responses into our DynamoDB schema format
 * 
 * Rekognition responses contain nested hierarchical labels.
 * We flatten and normalize them into simple { name, confidence } objects.
 */

export interface AiTag {
  name: string;
  confidence: number;
  category?: string;
  parents?: string[];
}

export interface ModerationLabel {
  name: string;
  confidence: number;
  parentName?: string;
}

/**
 * Map Rekognition DetectLabels response to our AiTag format
 * 
 * Rekognition Label structure:
 * {
 *   Name: "Mountain",
 *   Confidence: 98.5,
 *   Parents: [{ Name: "Nature" }, { Name: "Outdoors" }],
 *   Categories: [{ Name: "Nature and Outdoors" }],
 *   Instances: [{ BoundingBox: {...}, Confidence: 95.2 }],
 * }
 * 
 * We extract: name, confidence, category, parent hierarchy
 */
export function mapToAiTags(response: DetectLabelsResponse): AiTag[] {
  if (!response.Labels || response.Labels.length === 0) {
    return [];
  }

  return response.Labels
    .filter(label => label.Name && label.Confidence != null)
    .map(label => ({
      name: label.Name!,
      confidence: Math.round(label.Confidence! * 10) / 10, // 1 decimal place
      category: label.Categories?.[0]?.Name || undefined,
      parents: label.Parents?.map(p => p.Name!).filter(Boolean) || undefined,
    }))
    // Sort by confidence descending
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Map Rekognition DetectModerationLabels response to our ModerationLabel format
 * 
 * Moderation labels are hierarchical:
 * - ParentName: "Explicit Nudity" (top-level category)
 * - Name: "Nudity" (specific label)
 */
export function mapToModerationLabels(response: DetectModerationLabelsResponse): ModerationLabel[] {
  if (!response.ModerationLabels || response.ModerationLabels.length === 0) {
    return [];
  }

  return response.ModerationLabels
    .filter(label => label.Name && label.Confidence != null)
    .map(label => ({
      name: label.Name!,
      confidence: Math.round(label.Confidence! * 10) / 10,
      parentName: label.ParentName || undefined,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Determine overall moderation status based on detected labels
 * 
 * Logic:
 * - No moderation labels detected → SAFE
 * - Any label with confidence ≥ 80% → FLAGGED (needs human review)
 * - Specific high-severity categories → auto-FLAGGED at lower threshold
 * 
 * We intentionally flag (not auto-reject) because Rekognition can have
 * false positives. Human review is always recommended.
 */
export function determineModerationStatus(labels: ModerationLabel[]): string {
  if (labels.length === 0) {
    return 'SAFE';
  }

  // High-severity categories that should flag at lower confidence
  const HIGH_SEVERITY = [
    'Explicit Nudity',
    'Violence',
    'Visually Disturbing',
    'Hate Symbols',
  ];

  for (const label of labels) {
    // High-severity: flag at 60% confidence
    if (HIGH_SEVERITY.some(cat =>
      label.name === cat || label.parentName === cat,
    )) {
      if (label.confidence >= 60) {
        return 'FLAGGED';
      }
    }

    // Any moderation label at ≥ 80% confidence
    if (label.confidence >= 80) {
      return 'FLAGGED';
    }
  }

  // Labels exist but below threshold — still safe
  return 'SAFE';
}

/** Identifiers are plain strings so grade bands and categories can be added later. */
export type GradeBandId = string;
export type CategoryId = string;

export interface GradeBand {
  id: GradeBandId;
  label: string;
  short: string;
  /** A one-line prompt shown under the question, written for this age group. */
  cue: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
}

export interface Taxonomy {
  schemaVersion: number;
  defaultGrade: GradeBandId;
  defaultCategory: CategoryId;
  gradeBands: GradeBand[];
  categories: Category[];
}

export interface SiteConfig {
  siteName: string;
  defaultTimeZone: string;
  timeZoneOptions: string[];
}

export interface ImageInfo {
  /**
   * Image shown on the page. Omit it (and set `status: "pending"`) when no
   * verified, reusable image is available yet; the page then shows a
   * placeholder and the record is linked to a manual image library later.
   */
  url?: string;
  /** "pending" = placeholder shown until an image is linked. */
  status?: "pending";
  /** Link to a larger version, if the museum provides one. */
  fullUrl?: string;
  /** Smaller image for the archive. Falls back to `url`. */
  thumbUrl?: string;
  width?: number;
  height?: number;
  /** Credit line shown to the viewer, e.g. "The Metropolitan Museum of Art". */
  credit?: string;
  /** Plain-language usage rights, e.g. "Public domain (CC0)". Required when `url` is set. */
  license?: string;
  /** URL of the page that states the rights or open-access policy. */
  licenseUrl?: string;
}

export interface SourceInfo {
  museum: string;
  /** Museum collection record for this artwork. */
  url: string;
  /** Museum's own object identifier, if known. */
  objectId?: string;
  /** ISO date when the record was last checked against the source. */
  verifiedOn: string;
  /** How the record was checked, e.g. "museum API". */
  verifiedBy: string;
}

export interface SafetyReview {
  /**
   * "approved": a person has looked at the image and confirmed it is suitable.
   * "metadata-screened": subject and tags were checked against the museum
   * record but nobody has looked at the image yet. Ships, but is flagged.
   */
  status: "approved" | "metadata-screened" | "pending" | "rejected";
  /** What the review actually involved. Be specific and honest. */
  method: string;
  reviewedOn: string;
}

export interface TeacherNote {
  context?: string;
  vocabulary?: string[];
  directions?: string[];
}

export interface Artwork {
  id: string;
  /** "MM-DD". "02-29" is the dedicated leap-day artwork. */
  day: string;
  /** Title shown on the page. May be a shortened form of the museum's title. */
  title: string;
  /** The museum's full title, verbatim, when `title` is shortened. */
  recordTitle?: string;
  artist: string;
  /** Display date, e.g. "1889" or "ca. 1500–1550". */
  date: string;
  medium?: string;
  movement?: string;
  region?: string;
  image: ImageInfo;
  altText: string;
  source: SourceInfo;
  /** Short factual summary, used for sharing and as a reference for writers. */
  context: string;
  descriptions: Record<GradeBandId, string>;
  questions: Record<GradeBandId, Record<CategoryId, string>>;
  safety: SafetyReview;
  /** About six discussion words per grade band, shown under the question in classroom view. */
  helpfulWords?: Record<GradeBandId, string[]>;
  teacherNote?: TeacherNote;
}

/** Lightweight record used by the archive. Generated from the artwork files. */
export interface IndexEntry {
  id: string;
  day: string;
  title: string;
  artist: string;
  date: string;
  medium?: string;
  movement?: string;
  region?: string;
  thumbUrl: string;
}

export interface ArtworkIndex {
  generatedOn: string;
  count: number;
  entries: IndexEntry[];
}

// Response and request shapes of the NekoCap API.
// These mirror the types in nekocap's src/common/feature/*/types.ts (which
// can't be imported here as they depend on frontend-only packages) and must
// stay compatible with them: the same shapes are returned both by the REST
// endpoints and, through the legacy bridge, by the Parse cloud functions.

export type ResponseStatus = "success" | "error";

export type ServerResponse = {
  status: ResponseStatus;
  error?: string;
};

export type UploadResponse = ServerResponse & {
  captionId?: string;
};

export type CaptionListFields = {
  id: string;
  language?: string;
  videoId?: string;
  videoSource?: string;
  data: string;
  creatorId?: string;
  creatorName: string;
  videoName: string;
  videoLanguage: string;
  views: number;
  translatedTitle?: string;
  likes: number;
  dislikes: number;
  verified: boolean;
  rejected?: boolean;
  createdDate: number;
  updatedDate: number;
  tags: string[];
  privacy: number;
  advanced: boolean;
};

export type CaptionsResponse = ServerResponse & {
  captions: CaptionListFields[];
  hasMore?: boolean;
};

export type LoadCaptionsResult = {
  id: string;
  captionerId?: string;
  captionerName: string;
  verified: boolean;
  likes: number;
  dislikes: number;
  languageCode?: string;
  tags: string[];
  advanced: boolean;
};

export type CaptionerFields = {
  userId: string;
  name?: string;
  nameTag?: number;
  recs?: number;
  languageCodes?: string[];
  verified?: boolean;
  banned?: boolean;
  lastSubmissionTime: number;
  profileMessage?: string;
  donationLink?: string;
  captionCount: number;
  isReviewer: boolean;
  isReviewerManager: boolean;
  isAdmin: boolean;
  captionTags: string[];
};

export type CaptionerPrivateFields = {
  isReviewer: boolean;
  isReviewerManager: boolean;
  isAdmin: boolean;
};

export type PrivateCaptionerDataResponse = ServerResponse & {
  captions?: CaptionListFields[];
  captioner?: CaptionerFields;
  privateProfile?: CaptionerPrivateFields;
};

export type PublicProfileResponse = ServerResponse & {
  captions?: CaptionListFields[];
  captioner?: CaptionerFields;
};

export type ReviewActionDetails = {
  reviewerId: string;
  reviewerName?: string;
  newState: "rejected" | "unrejected" | "verified" | "unverified";
  reason?: string;
  date: number;
};

/**
 * A caption object in the JSON format Parse uses for objects
 * (`Parse.Object#toJSON()`), minus the ACL. The legacy bridge turns this back
 * into a Parse.Object for old clients.
 */
export type CaptionObjectJSON = {
  objectId: string;
  createdAt?: string;
  updatedAt?: string;
  creatorId?: string;
  language?: string;
  videoId?: string;
  videoSource?: string;
  content?: string;
  translatedTitle?: string;
  tags?: string[];
  privacy?: number | null;
  verified?: boolean;
  rejected?: boolean;
  likes?: number;
  dislikes?: number;
  views?: number;
  reviewHistory?: ReviewActionDetails[];
  rawContent?: string | null;
  rawFile?: { __type: "File"; name: string; url: string } | null;
};

export type LoadSingleCaptionResponse = ServerResponse & {
  caption?: CaptionObjectJSON;
  rawCaption?: string;
  rawCaptionUrl?: string;
  userLike?: boolean;
  userDislike?: boolean;
  originalTitle?: string;
  captionerName?: string;
};

export type LoadCaptionForReviewResponse = ServerResponse & {
  caption?: CaptionObjectJSON;
  captioner?: CaptionerFields;
  videoName?: string;
};

export type BrowseResponse = ServerResponse & {
  captions: CaptionListFields[];
  hasMoreResults: boolean;
  totalCount: number;
};

export type GlobalStats = {
  totalViews: number;
  totalCaptions: number;
  totalViewsPerLanguage: { languageCode: string; views: number }[];
  totalCaptionsPerLanguage: { languageCode: string; count: number }[];
  topCaptionsAllTime: CaptionListFields[];
  topCaptionsUploadedThisMonth: CaptionListFields[];
};

export type StatsResponse = ServerResponse & {
  result?: GlobalStats;
};

export type GetOwnProfileTagsResponse = ServerResponse & {
  tags?: { tag: string; count: number }[];
};

export type AutoCaptionListResponse = ServerResponse & {
  captions: unknown[];
};

export type AdvancedFilter = "all" | "advanced" | "nonAdvanced";

export type RawCaptionData = {
  type: string;
  data: string;
};

export type SubmitCaptionRequest = {
  caption: {
    videoId: string;
    videoSource: number;
    languageCode: string;
    translatedTitle: string;
    data: unknown;
  };
  rawCaption?: RawCaptionData;
  video: {
    name: string;
    languageCode: string;
  };
  hasAudioDescription?: boolean;
  privacy?: number;
};

export type UpdateCaptionRequest = {
  captionId: string;
  captionData?: unknown;
  rawCaption?: RawCaptionData;
  hasAudioDescription?: boolean;
  translatedTitle?: string;
  selectedTags?: string[];
  privacy?: number;
};

export type CaptionsRequest = {
  captionerId: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  advancedFilter?: AdvancedFilter;
  titleFilter?: string;
};

export type UpdateCaptionerProfileRequest = {
  name: string;
  donationLink?: string;
  profileMessage?: string;
  languageCodes: string[];
  userId?: string;
};

export type ReasonedCaptionAction = {
  captionId: string;
  reason?: string;
};

export type LoginResponse = ServerResponse & {
  sessionToken?: string;
  userId?: string;
  username?: string;
  isNewUser?: boolean;
};

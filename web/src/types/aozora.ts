
export interface Book {
  book_id: string; // Document ID
  title: string;
  title_yomi: string;
  title_sort: string;
  subtitle?: string;
  subtitle_yomi?: string;
  original_title?: string;
  first_appearance?: string;
  ndc_code?: string;
  font_kana_type?: string;
  copyright: boolean;
  release_date: string; // Date stored as string? or Timestamp? DATA_FORMAT says "Date/String"
  last_modified: string;
  card_url: string;
  text_url?: string;
  html_url?: string;
  explanation?: string;
  base_book_1?: string;
  base_book_1_publisher?: string;
  base_book_1_1st_edition?: string;
  input?: string;
  proofing?: string;
  base_book_1_proofing_edition?: string;
  base_book_1_input_edition?: string;
  [key: string]: any; // For other metadata fields
}

export interface Person {
  person_id: string; // Document ID
  first_name: string;
  last_name: string;
  last_name_yomi: string;
  first_name_yomi: string;
  first_name_sort: string;
  last_name_sort: string;
  first_name_roman?: string;
  last_name_roman?: string;
  date_of_birth?: string;
  date_of_death?: string;
  author_copyright?: boolean;
}

export interface Contributor {
  id: string; // Composite ID {book_id}-{person_id}-{role_id}
  book_id: number;
  person_id: number;
  role: number;
}

export const ROLES = {
  0: '著者',
  1: '翻訳者',
  2: '編者',
  3: '校訂者',
  4: 'その他',
} as const;

export type RoleId = keyof typeof ROLES;

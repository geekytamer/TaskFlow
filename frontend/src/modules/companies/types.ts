export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
}

export interface Position {
    id: string;
    title: string;
    companyId?: string;
}

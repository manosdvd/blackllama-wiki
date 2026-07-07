import { getAdminDb } from '@/lib/firebase/admin';

export function getAdminDbOnly() {
  return getAdminDb();
}

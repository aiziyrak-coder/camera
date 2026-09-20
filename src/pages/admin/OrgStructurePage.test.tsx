import { describe, expect, it } from 'vitest';
import { deleteConsequences } from './OrgStructurePage';
import type { Building, Department, Faculty, StudentGroup } from '../../types';

/**
 * QA: o'chirish tasdig'i.
 *
 * Ilgari to'rttala tur uchun bitta matn turardi — "«X» butunlay o'chiriladi".
 * Amalda oqibatlar juda har xil:
 *   • fakultet o'chirilsa uning GURUHLARI ham ketadi
 *     (app/models/org.py: student_groups.faculty_id ondelete="CASCADE"),
 *   • bino o'chirilsa qavat sxemalari ketadi (floor_plans CASCADE),
 *     kameralar esa qoladi-yu binosiz bo'ladi (cameras.building_id SET NULL).
 * Admin buni tasdiqlashdan OLDIN bilishi kerak.
 */

const building: Building = { id: 'b1', name: '1-Bino', cameraCount: 12, floors: 4, sortOrder: 0 };
const faculty: Faculty = { id: 'f1', name: 'Davolash ishi', courseCount: 6, studentCount: 540 };
const group: StudentGroup = { id: 'g1', name: 'DI-2301', faculty: 'Davolash ishi', course: 2, studentCount: 25 };
const department: Department = { id: 'd1', name: 'Anatomiya', buildingId: 'b1', buildingName: '1-Bino', cameraCount: 3 };

describe('deleteConsequences', () => {
  it('fakultet: guruhlari birga o\'chishini aytadi', () => {
    const { lost, kept } = deleteConsequences({ kind: 'faculty', item: faculty }, 20);
    expect(lost.join(' ')).toMatch(/20 ta guruh/);
    expect(kept.join(' ')).toMatch(/540 ta talaba/);
  });

  it('bino: qavat sxemalari ketadi, kameralar qoladi', () => {
    const { lost, kept } = deleteConsequences({ kind: 'building', item: building }, 0);
    expect(lost.join(' ')).toMatch(/qavat/i);
    expect(kept.join(' ')).toMatch(/12 ta kamera/);
  });

  it("guruh: talabalar reestrda qolishi aytiladi", () => {
    const { kept } = deleteConsequences({ kind: 'group', item: group }, 0);
    expect(kept.join(' ')).toMatch(/25 ta talaba/);
  });

  it('kafedra: kameralar kafedrasiz qoladi', () => {
    const { kept } = deleteConsequences({ kind: 'department', item: department }, 0);
    expect(kept.join(' ')).toMatch(/3 ta kamera/);
  });

  it('har bir turda ham "o\'chadi", ham "qoladi" ro\'yxati bo\'sh emas', () => {
    const targets = [
      { kind: 'building' as const, item: building },
      { kind: 'faculty' as const, item: faculty },
      { kind: 'group' as const, item: group },
      { kind: 'department' as const, item: department },
    ];
    for (const target of targets) {
      const { lost, kept } = deleteConsequences(target, 0);
      expect(lost.length).toBeGreaterThan(0);
      expect(kept.length).toBeGreaterThan(0);
    }
  });
});

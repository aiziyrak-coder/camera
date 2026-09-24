from app.database import Base
from app.models.ai_module import AIModuleConfig
from app.models.attendance import AttendanceRecord
from app.models.attendance_policy import AttendancePolicy
from app.models.audit_log import AuditLog
from app.models.camera import Camera
from app.models.camera_outage import CameraOutage
from app.models.enrollment_code import EnrollmentCode
from app.models.event import Event
from app.models.face_gallery import FaceGalleryEmbedding
from app.models.face_review import FaceReviewItem
from app.models.unknown_sighting import UnknownSighting
from app.models.lesson_attendance import LessonAttendance
from app.models.lesson_session import LessonSession
from app.models.module_suppression import ModuleCameraSuppression
from app.models.org import Building, Department, Faculty, StudentGroup
from app.models.password_reset_token import PasswordResetToken
from app.models.permission import Permission
from app.models.platform import (
    AccessDevice,
    AccessEvent,
    EventComment,
    FloorPlan,
    IntegrationSyncRun,
    NotificationLog,
    NotificationRule,
)
from app.models.presence_visit import PresenceVisit
from app.models.report import Report
from app.models.report_schedule import ReportSchedule
from app.models.revoked_token import RevokedToken
from app.models.student_staff import StudentStaff
from app.models.user import User
from app.models.wall_view import WallView

__all__ = [
    "Base",
    "AttendancePolicy",
    "User",
    "Permission",
    "Faculty",
    "StudentGroup",
    "Building",
    "Department",
    "StudentStaff",
    "AuditLog",
    "Camera",
    "CameraOutage",
    "EnrollmentCode",
    "Event",
    "FaceGalleryEmbedding",
    "FaceReviewItem",
    "UnknownSighting",
    "AIModuleConfig",
    "AttendanceRecord",
    "LessonSession",
    "LessonAttendance",
    "ModuleCameraSuppression",
    "PresenceVisit",
    "Report",
    "ReportSchedule",
    "RevokedToken",
    "PasswordResetToken",
    "NotificationRule",
    "NotificationLog",
    "EventComment",
    "FloorPlan",
    "AccessDevice",
    "AccessEvent",
    "IntegrationSyncRun",
    "WallView",
]

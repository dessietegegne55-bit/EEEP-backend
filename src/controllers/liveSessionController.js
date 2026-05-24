// backend/src/controllers/liveSessionController.js
// COMPLETE FIXED - All functions working properly

const { LiveSession, SessionParticipant, Student, User, Teacher } = require('../models');
const { Op } = require('sequelize');

// Helper function for current time
const getCurrentTime = () => {
  return new Date();
};

// Get full name from user (name + fatherName + grandfatherName)
const getFullName = (user) => {
  if (!user) return 'Unknown';
  const fullName = `${user.name || ''} ${user.fatherName || ''} ${user.grandfatherName || ''}`.trim().replace(/\s+/g, ' ');
  return fullName || 'Teacher';
};

// ===========================================
// TEACHER: Create Live Session
// ===========================================
const createSession = async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      platform,
      meetingLink,
      gradeLevel,
      maxParticipants
    } = req.body;

    const user = await User.findByPk(req.user.id);
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    const teacherDepartment = teacher.department || 'Both';
    const teacherSubject = teacher.specialization || 'General';
    const teacherFullName = getFullName(user);

    console.log(`📚 Creating session: ${teacherSubject}, Department: ${teacherDepartment}`);

    const session = await LiveSession.create({
      title,
      description: description || null,
      subject: teacherSubject,
      teacherId: teacher.id, // Use teacher.id instead of req.user.id
      department: teacherDepartment,
      gradeLevel: gradeLevel || 12,
      startTime: new Date(startTime),
      endTime: null,
      meetingUrl: meetingLink || null,
      status: 'scheduled'
    });

    res.status(201).json({
      success: true,
      data: session,
      message: 'Live session created successfully'
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// TEACHER: Get My Sessions
// ===========================================
const getTeacherSessions = async (req, res) => {
  try {
    console.log(`📺 Fetching sessions for user ID: ${req.user.id}`);

    // First get the teacher record to get the correct teacherId
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    console.log(`📺 Teacher ID: ${teacher.id}`);

    const sessions = await LiveSession.findAll({
      where: { teacherId: teacher.id }, // Use teacher.id instead of req.user.id
      order: [['createdAt', 'DESC']]
    });

    console.log(`✅ Found ${sessions.length} sessions`);

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Get teacher sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ===========================================
// TEACHER: Start Session
// ===========================================
const startSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get teacher record first
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    const session = await LiveSession.findOne({
      where: { id: sessionId, teacherId: teacher.id } // Use teacher.id
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.status !== 'scheduled') {
      return res.status(400).json({ success: false, error: 'Session cannot be started' });
    }

    const now = getCurrentTime();
    const endTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // 2 hours default

    await session.update({
      status: 'live',
      endTime: endTime
    });

    console.log(`✅ Session started: ${session.title} (ID: ${session.id})`);
    console.log(`   End time: ${endTime.toLocaleString()}`);

    res.json({
      success: true,
      data: session,
      message: `Session started! Ends at ${endTime.toLocaleTimeString()}`
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// TEACHER: End Session
// ===========================================
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get teacher record first
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    const session = await LiveSession.findOne({
      where: { id: sessionId, teacherId: teacher.id } // Use teacher.id
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.status !== 'live') {
      return res.status(400).json({ success: false, error: 'Session is not live' });
    }

    await session.update({ status: 'ended' });

    console.log(`✅ Session ended: ${session.title}`);

    res.json({
      success: true,
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// TEACHER: Cancel Session
// ===========================================
const cancelSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get teacher record first
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    const session = await LiveSession.findOne({
      where: { id: sessionId, teacherId: teacher.id } // Use teacher.id
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ success: false, error: 'Cannot cancel ended session' });
    }

    await session.update({ status: 'cancelled' });

    console.log(`✅ Session cancelled: ${session.title}`);

    res.json({
      success: true,
      message: 'Session cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// TEACHER: Delete Session
// ===========================================
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get teacher record first
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher profile not found' });
    }

    const session = await LiveSession.findOne({
      where: { id: sessionId, teacherId: teacher.id } // Use teacher.id
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Delete associated participants first
    await SessionParticipant.destroy({
      where: { sessionId: session.id }
    });

    // Delete the session
    await session.destroy();

    console.log(`✅ Session deleted: ${session.title}`);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// STUDENT: Get Available Sessions (Scheduled + Live)
// ===========================================
const getStudentSessions = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });

    if (!student) {
      return res.json({ success: true, data: [] });
    }

    const now = getCurrentTime();

    // Get scheduled sessions (future) with teacher info
    const scheduledSessions = await LiveSession.findAll({
      where: {
        status: 'scheduled',
        startTime: { [Op.gt]: now }
      },
      include: [{
        model: Teacher,
        as: 'teacher',
        include: [{
          model: User,
          as: 'user',
          attributes: ['name', 'fatherName', 'grandfatherName']
        }]
      }],
      order: [['startTime', 'ASC']]
    });

    // Get live sessions (ongoing) with teacher info
    const liveSessions = await LiveSession.findAll({
      where: {
        status: 'live'
      },
      include: [{
        model: Teacher,
        as: 'teacher',
        include: [{
          model: User,
          as: 'user',
          attributes: ['name', 'fatherName', 'grandfatherName']
        }]
      }]
    });

    const allSessions = [...scheduledSessions, ...liveSessions];

    // Filter by department and grade
    const filteredSessions = allSessions.filter(session => {
      const departmentMatch = session.department === 'Both' || session.department === student.department;
      const gradeMatch = session.gradeLevel === student.gradeLevel;
      return departmentMatch && gradeMatch;
    });

    // Add registration status and teacher name
    const sessionsWithStatus = await Promise.all(filteredSessions.map(async (session) => {
      const participant = await SessionParticipant.findOne({
        where: { sessionId: session.id, studentId: student.id }
      });

      const isLive = session.status === 'live';
      const teacherName = session.teacher?.user ? getFullName(session.teacher.user) : 'Teacher';

      return {
        ...session.toJSON(),
        teacherName,
        hasRegistered: !!participant,
        isLive: isLive,
        meetingUrl: isLive ? session.meetingUrl : null
      };
    }));

    // Sort: Live first, then by start time
    sessionsWithStatus.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return new Date(a.startTime) - new Date(b.startTime);
    });

    res.json({
      success: true,
      data: sessionsWithStatus
    });
  } catch (error) {
    console.error('Get student sessions error:', error);
    res.json({ success: true, data: [] });
  }
};

// ===========================================
// STUDENT: Get Ongoing/Live Sessions (for modal)
// ===========================================
const getOngoingSessions = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });

    if (!student) {
      return res.json({ success: true, data: [] });
    }

    const liveSessions = await LiveSession.findAll({
      where: {
        status: 'live'
      }
    });

    const filteredSessions = [];

    for (const session of liveSessions) {
      const departmentMatch = session.department === 'Both' || session.department === student.department;
      const gradeMatch = session.gradeLevel === student.gradeLevel;

      if (departmentMatch && gradeMatch) {
        const participant = await SessionParticipant.findOne({
          where: { sessionId: session.id, studentId: student.id, status: 'active' }
        });

        filteredSessions.push({
          ...session.toJSON(),
          hasJoined: !!participant
        });
      }
    }

    res.json({
      success: true,
      data: filteredSessions
    });
  } catch (error) {
    console.error('Get ongoing sessions error:', error);
    res.json({ success: true, data: [] });
  }
};

// ===========================================
// STUDENT: Join/Register for Session
// ===========================================
const joinSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log(`🔗 Join/Register request for session ID: ${sessionId}`);

    const student = await Student.findOne({
      where: { userId: req.user.id },
      include: [{ model: User, as: 'user' }]
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const studentFullName = getFullName(student.user);
    console.log(`👨‍🎓 Student: ${studentFullName}, Department: ${student.department}, Grade: ${student.gradeLevel}`);

    const session = await LiveSession.findByPk(parseInt(sessionId));
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    console.log(`📺 Session: ${session.title}, Status: ${session.status}, Department: ${session.department}, Grade: ${session.gradeLevel}`);

    // Check department and grade match
    const departmentMatch = session.department === 'Both' || session.department === student.department;
    const gradeMatch = session.gradeLevel === student.gradeLevel;

    if (!departmentMatch || !gradeMatch) {
      return res.status(400).json({
        success: false,
        error: 'This session is not available for your department or grade'
      });
    }

    // Check if session is full
    if (session.currentParticipants >= session.maxParticipants) {
      return res.status(400).json({
        success: false,
        error: 'Session is full'
      });
    }

    // Check if already registered/joined
    const existing = await SessionParticipant.findOne({
      where: { sessionId: session.id, studentId: student.id }
    });

    if (existing && existing.status === 'active') {
      return res.json({
        success: true,
        data: {
          session,
          alreadyJoined: true,
          meetingLink: session.meetingUrl,
          isLive: session.status === 'live'
        },
        message: session.status === 'live' ? 'Already joined this session' : 'Already registered for this session'
      });
    }

    // Create or update participant
    if (existing) {
      await existing.update({
        status: 'active',
        joinedAt: new Date(),
        leftAt: null
      });
      console.log('✅ Updated existing participant');
    } else {
      await SessionParticipant.create({
        sessionId: session.id,
        studentId: student.id,
        studentName: studentFullName,
        joinedAt: new Date(),
        status: 'active'
      });
      console.log('✅ Created new participant');
    }

    // Update participant count
    const participantCount = await SessionParticipant.count({
      where: { sessionId: session.id, status: 'active' }
    });
    await session.update({ currentParticipants: participantCount });

    console.log(`✅ Student joined. Total participants: ${participantCount}`);

    // If session is live, return meeting link
    if (session.status === 'live') {
      res.json({
        success: true,
        data: {
          session,
          meetingLink: session.meetingUrl,
          isLive: true
        },
        message: 'Successfully joined live session!'
      });
    } else {
      res.json({
        success: true,
        data: {
          session,
          isLive: false,
          meetingLink: null
        },
        message: `Successfully registered for session. Session starts at ${new Date(session.startTime).toLocaleString()}`
      });
    }
  } catch (error) {
    console.error('❌ Join session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// STUDENT: Leave Session
// ===========================================
const leaveSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const participant = await SessionParticipant.findOne({
      where: { sessionId, studentId: student.id, status: 'active' }
    });

    if (!participant) {
      return res.status(400).json({ success: false, error: 'Not a participant' });
    }

    const duration = Math.floor((new Date() - participant.joinedAt) / 1000 / 60);
    await participant.update({
      status: 'left',
      leftAt: new Date(),
      duration
    });

    const session = await LiveSession.findByPk(sessionId);
    const activeCount = await SessionParticipant.count({
      where: { sessionId, status: 'active' }
    });
    await session.update({ currentParticipants: activeCount });

    console.log(`👋 Student left session: ${session.title}`);

    res.json({
      success: true,
      message: 'Left session successfully'
    });
  } catch (error) {
    console.error('Leave session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===========================================
// STUDENT: Get My Joined Sessions (History)
// ===========================================
const getMyJoinedSessions = async (req, res) => {
  try {
    const student = await Student.findOne({ where: { userId: req.user.id } });

    if (!student) {
      return res.json({ success: true, data: [] });
    }

    const participants = await SessionParticipant.findAll({
      where: { studentId: student.id },
      include: [{ model: LiveSession, as: 'session' }],
      order: [['joinedAt', 'DESC']]
    });

    const sessions = participants.map(p => ({
      ...p.session.toJSON(),
      joinedAt: p.joinedAt,
      duration: p.duration,
      participantStatus: p.status
    }));

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Get joined sessions error:', error);
    res.json({ success: true, data: [] });
  }
};

// ===========================================
// EXPORT ALL FUNCTIONS
// ===========================================
module.exports = {
  createSession,
  getTeacherSessions,
  getStudentSessions,
  getOngoingSessions,
  joinSession,
  leaveSession,
  startSession,
  endSession,
  cancelSession,
  deleteSession,
  getMyJoinedSessions
};
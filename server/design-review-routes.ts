import { Router } from 'express';
import { eq, and, or, like, desc, asc } from 'drizzle-orm';
import { db } from './db';
import { 
  designReviews, 
  reviewComments, 
  designDrawings, 
  drawingVersions, 
  designProjects,
  users 
} from '../shared/schema';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(ensureAuthenticated);

// GET /api/design/reviews - List reviews with filters
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      discipline, 
      reviewer, 
      project, 
      searchTerm,
      tab = 'active'
    } = req.query as Record<string, string>;

    let query = db
      .select({
        id: designReviews.id,
        drawingId: designReviews.drawingId,
        versionId: designReviews.versionId,
        reviewType: designReviews.reviewType,
        reviewStage: designReviews.reviewStage,
        reviewTitle: designReviews.reviewTitle,
        reviewerId: designReviews.reviewerId,
        reviewerRole: designReviews.reviewerRole,
        status: designReviews.status,
        priority: designReviews.priority,
        reviewComments: designReviews.reviewComments,
        markupFileUrl: designReviews.markupFileUrl,
        requestedDate: designReviews.requestedDate,
        dueDate: designReviews.dueDate,
        startedDate: designReviews.startedDate,
        completedDate: designReviews.completedDate,
        recommendation: designReviews.recommendation,
        createdBy: designReviews.createdBy,
        createdAt: designReviews.createdAt,
        updatedAt: designReviews.updatedAt,
        // Drawing information
        drawing: {
          drawingNumber: designDrawings.drawingNumber,
          drawingTitle: designDrawings.drawingTitle,
          category: designDrawings.category,
          disciplineCode: designDrawings.disciplineCode,
          status: designDrawings.status,
        },
        // Reviewer information
        reviewer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        }
      })
      .from(designReviews)
      .leftJoin(designDrawings, eq(designReviews.drawingId, designDrawings.id))
      .leftJoin(users, eq(designReviews.reviewerId, users.id));

    // Build filter conditions
    const conditions = [];

    // Tab-based filtering
    if (tab === 'active') {
      conditions.push(
        or(
          eq(designReviews.status, 'Pending'),
          eq(designReviews.status, 'In Progress'),
          eq(designReviews.status, 'Under Review')
        )
      );
    } else if (tab === 'completed') {
      conditions.push(
        or(
          eq(designReviews.status, 'Approved'),
          eq(designReviews.status, 'Rejected'),
          eq(designReviews.status, 'Closed')
        )
      );
    }

    // Apply filters
    if (status) {
      conditions.push(eq(designReviews.status, status));
    }

    if (priority) {
      conditions.push(eq(designReviews.priority, priority));
    }

    if (discipline) {
      conditions.push(eq(designDrawings.disciplineCode, discipline));
    }

    if (reviewer) {
      conditions.push(eq(designReviews.reviewerId, parseInt(reviewer)));
    }

    if (project) {
      // Join with design projects to filter by project
      query = query.leftJoin(designProjects, eq(designDrawings.designProjectId, designProjects.id));
      conditions.push(eq(designProjects.projectId, parseInt(project)));
    }

    if (searchTerm) {
      conditions.push(
        or(
          like(designReviews.reviewTitle, `%${searchTerm}%`),
          like(designDrawings.drawingNumber, `%${searchTerm}%`),
          like(designDrawings.drawingTitle, `%${searchTerm}%`),
          like(designReviews.reviewComments, `%${searchTerm}%`)
        )
      );
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Order by priority and due date
    query = query.orderBy(
      desc(designReviews.priority), // High priority first
      asc(designReviews.dueDate),   // Earliest due date first
      desc(designReviews.createdAt) // Most recent first
    );

    const reviews = await query.execute();

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching design reviews:', error);
    res.status(500).json({ error: 'Failed to fetch design reviews' });
  }
});

// GET /api/design/reviews/:id - Get specific review details
router.get('/:id', async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);

    const review = await db
      .select({
        id: designReviews.id,
        drawingId: designReviews.drawingId,
        versionId: designReviews.versionId,
        reviewType: designReviews.reviewType,
        reviewStage: designReviews.reviewStage,
        reviewTitle: designReviews.reviewTitle,
        reviewerId: designReviews.reviewerId,
        reviewerRole: designReviews.reviewerRole,
        status: designReviews.status,
        priority: designReviews.priority,
        reviewComments: designReviews.reviewComments,
        markupFileUrl: designReviews.markupFileUrl,
        requestedDate: designReviews.requestedDate,
        dueDate: designReviews.dueDate,
        startedDate: designReviews.startedDate,
        completedDate: designReviews.completedDate,
        recommendation: designReviews.recommendation,
        createdBy: designReviews.createdBy,
        createdAt: designReviews.createdAt,
        updatedAt: designReviews.updatedAt,
        // Drawing information
        drawing: {
          id: designDrawings.id,
          drawingNumber: designDrawings.drawingNumber,
          drawingTitle: designDrawings.drawingTitle,
          category: designDrawings.category,
          disciplineCode: designDrawings.disciplineCode,
          description: designDrawings.description,
          status: designDrawings.status,
          currentRevision: designDrawings.currentRevision,
        },
        // Reviewer information
        reviewer: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          email: users.email,
        }
      })
      .from(designReviews)
      .leftJoin(designDrawings, eq(designReviews.drawingId, designDrawings.id))
      .leftJoin(users, eq(designReviews.reviewerId, users.id))
      .where(eq(designReviews.id, reviewId))
      .execute();

    if (review.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Get review comments
    const comments = await db
      .select({
        id: reviewComments.id,
        commentNumber: reviewComments.commentNumber,
        commentType: reviewComments.commentType,
        discipline: reviewComments.discipline,
        comment: reviewComments.comment,
        location: reviewComments.location,
        category: reviewComments.category,
        designerResponse: reviewComments.designerResponse,
        resolutionAction: reviewComments.resolutionAction,
        resolutionStatus: reviewComments.resolutionStatus,
        raisedDate: reviewComments.raisedDate,
        targetResolutionDate: reviewComments.targetResolutionDate,
        resolvedDate: reviewComments.resolvedDate,
        verifiedDate: reviewComments.verifiedDate,
        assignedToId: reviewComments.assignedToId,
        verifiedById: reviewComments.verifiedById,
        createdBy: reviewComments.createdBy,
        createdAt: reviewComments.createdAt,
        updatedAt: reviewComments.updatedAt,
      })
      .from(reviewComments)
      .where(eq(reviewComments.reviewId, reviewId))
      .orderBy(asc(reviewComments.commentNumber))
      .execute();

    res.json({
      ...review[0],
      comments
    });
  } catch (error) {
    console.error('Error fetching review details:', error);
    res.status(500).json({ error: 'Failed to fetch review details' });
  }
});

// POST /api/design/reviews - Create new review
router.post('/', async (req, res) => {
  try {
    const {
      drawingId,
      versionId,
      reviewType,
      reviewStage,
      reviewTitle,
      reviewerId,
      reviewerRole,
      priority = 'Medium',
      dueDate,
      reviewComments
    } = req.body;

    // Validate required fields
    if (!drawingId || !reviewType || !reviewerId) {
      return res.status(400).json({ 
        error: 'Missing required fields: drawingId, reviewType, and reviewerId are required' 
      });
    }

    // Verify drawing exists
    const drawing = await db
      .select({ id: designDrawings.id })
      .from(designDrawings)
      .where(eq(designDrawings.id, drawingId))
      .execute();

    if (drawing.length === 0) {
      return res.status(400).json({ error: 'Drawing not found' });
    }

    // Verify reviewer exists
    const reviewer = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, reviewerId))
      .execute();

    if (reviewer.length === 0) {
      return res.status(400).json({ error: 'Reviewer not found' });
    }

    // Create the review
    const [newReview] = await db
      .insert(designReviews)
      .values({
        drawingId,
        versionId: versionId || null,
        reviewType,
        reviewStage,
        reviewTitle,
        reviewerId,
        reviewerRole,
        status: 'Pending',
        priority,
        reviewComments,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdBy: req.user!.id,
      })
      .returning()
      .execute();

    // TODO: Send notification to reviewer
    // TODO: Create initial comment if reviewComments provided

    res.status(201).json(newReview);
  } catch (error) {
    console.error('Error creating design review:', error);
    res.status(500).json({ error: 'Failed to create design review' });
  }
});

// PUT /api/design/reviews/:id - Update review
router.put('/:id', async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);
    const {
      reviewType,
      reviewStage,
      reviewTitle,
      reviewerId,
      reviewerRole,
      status,
      priority,
      reviewComments,
      dueDate,
      recommendation
    } = req.body;

    // Check if review exists
    const existingReview = await db
      .select({ id: designReviews.id, status: designReviews.status })
      .from(designReviews)
      .where(eq(designReviews.id, reviewId))
      .execute();

    if (existingReview.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Build update object
    const updateData: any = { updatedAt: new Date() };

    if (reviewType !== undefined) updateData.reviewType = reviewType;
    if (reviewStage !== undefined) updateData.reviewStage = reviewStage;
    if (reviewTitle !== undefined) updateData.reviewTitle = reviewTitle;
    if (reviewerId !== undefined) updateData.reviewerId = reviewerId;
    if (reviewerRole !== undefined) updateData.reviewerRole = reviewerRole;
    if (priority !== undefined) updateData.priority = priority;
    if (reviewComments !== undefined) updateData.reviewComments = reviewComments;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (recommendation !== undefined) updateData.recommendation = recommendation;

    // Handle status changes with timestamps
    if (status !== undefined && status !== existingReview[0].status) {
      updateData.status = status;
      
      switch (status) {
        case 'In Progress':
          if (!existingReview[0].status || existingReview[0].status === 'Pending') {
            updateData.startedDate = new Date();
          }
          break;
        case 'Approved':
        case 'Rejected':
        case 'Closed':
          updateData.completedDate = new Date();
          break;
      }
    }

    // Update the review
    const [updatedReview] = await db
      .update(designReviews)
      .set(updateData)
      .where(eq(designReviews.id, reviewId))
      .returning()
      .execute();

    // TODO: Send notification for status changes
    // TODO: Log activity for audit trail

    res.json(updatedReview);
  } catch (error) {
    console.error('Error updating design review:', error);
    res.status(500).json({ error: 'Failed to update design review' });
  }
});

// POST /api/design/reviews/:id/assign - Assign/reassign reviewer
router.post('/:id/assign', async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);
    const { reviewerId, reviewerRole, notifyReviewer = true } = req.body;

    if (!reviewerId) {
      return res.status(400).json({ error: 'reviewerId is required' });
    }

    // Verify reviewer exists
    const reviewer = await db
      .select({ 
        id: users.id, 
        username: users.username, 
        email: users.email 
      })
      .from(users)
      .where(eq(users.id, reviewerId))
      .execute();

    if (reviewer.length === 0) {
      return res.status(400).json({ error: 'Reviewer not found' });
    }

    // Update the review assignment
    const [updatedReview] = await db
      .update(designReviews)
      .set({ 
        reviewerId, 
        reviewerRole,
        updatedAt: new Date()
      })
      .where(eq(designReviews.id, reviewId))
      .returning()
      .execute();

    if (!updatedReview) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // TODO: Send notification to new reviewer if notifyReviewer is true
    // TODO: Send notification to previous reviewer about reassignment
    // TODO: Log assignment activity

    res.json({ 
      success: true, 
      review: updatedReview,
      reviewer: reviewer[0]
    });
  } catch (error) {
    console.error('Error assigning reviewer:', error);
    res.status(500).json({ error: 'Failed to assign reviewer' });
  }
});

// GET /api/design/reviews/:id/comments - Get review comments
router.get('/:id/comments', async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);

    const comments = await db
      .select({
        id: reviewComments.id,
        reviewId: reviewComments.reviewId,
        commentNumber: reviewComments.commentNumber,
        commentType: reviewComments.commentType,
        discipline: reviewComments.discipline,
        comment: reviewComments.comment,
        location: reviewComments.location,
        category: reviewComments.category,
        designerResponse: reviewComments.designerResponse,
        resolutionAction: reviewComments.resolutionAction,
        resolutionStatus: reviewComments.resolutionStatus,
        raisedDate: reviewComments.raisedDate,
        targetResolutionDate: reviewComments.targetResolutionDate,
        resolvedDate: reviewComments.resolvedDate,
        verifiedDate: reviewComments.verifiedDate,
        assignedToId: reviewComments.assignedToId,
        verifiedById: reviewComments.verifiedById,
        createdBy: reviewComments.createdBy,
        createdAt: reviewComments.createdAt,
        updatedAt: reviewComments.updatedAt,
        // Creator information
        creator: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(reviewComments)
      .leftJoin(users, eq(reviewComments.createdBy, users.id))
      .where(eq(reviewComments.reviewId, reviewId))
      .orderBy(asc(reviewComments.commentNumber), desc(reviewComments.createdAt))
      .execute();

    res.json(comments);
  } catch (error) {
    console.error('Error fetching review comments:', error);
    res.status(500).json({ error: 'Failed to fetch review comments' });
  }
});

// POST /api/design/reviews/:id/comments - Add new comment
router.post('/:id/comments', async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id);
    const {
      commentType = 'General',
      discipline,
      comment,
      location,
      category,
      targetResolutionDate,
      assignedToId
    } = req.body;

    if (!comment) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    // Get the next comment number for this review
    const lastComment = await db
      .select({ commentNumber: reviewComments.commentNumber })
      .from(reviewComments)
      .where(eq(reviewComments.reviewId, reviewId))
      .orderBy(desc(reviewComments.commentNumber))
      .limit(1)
      .execute();

    const nextCommentNumber = lastComment.length > 0 ? lastComment[0].commentNumber + 1 : 1;

    // Create the comment
    const [newComment] = await db
      .insert(reviewComments)
      .values({
        reviewId,
        commentNumber: nextCommentNumber,
        commentType,
        discipline,
        comment,
        location,
        category,
        targetResolutionDate: targetResolutionDate ? new Date(targetResolutionDate) : null,
        assignedToId,
        createdBy: req.user!.id,
      })
      .returning()
      .execute();

    // TODO: Send notification to assigned user if assignedToId provided
    // TODO: Update review status if needed

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error creating review comment:', error);
    res.status(500).json({ error: 'Failed to create review comment' });
  }
});

// GET /api/design/drawings/registry - Get available drawings for review
router.get('/drawings/registry', async (req, res) => {
  try {
    const { discipline, project, search } = req.query as Record<string, string>;

    let query = db
      .select({
        id: designDrawings.id,
        drawingNumber: designDrawings.drawingNumber,
        drawingTitle: designDrawings.drawingTitle,
        category: designDrawings.category,
        disciplineCode: designDrawings.disciplineCode,
        description: designDrawings.description,
        status: designDrawings.status,
        currentRevision: designDrawings.currentRevision,
        designProjectId: designDrawings.designProjectId,
      })
      .from(designDrawings);

    const conditions = [];

    if (discipline) {
      conditions.push(eq(designDrawings.disciplineCode, discipline));
    }

    if (project) {
      query = query.leftJoin(designProjects, eq(designDrawings.designProjectId, designProjects.id));
      conditions.push(eq(designProjects.projectId, parseInt(project)));
    }

    if (search) {
      conditions.push(
        or(
          like(designDrawings.drawingNumber, `%${search}%`),
          like(designDrawings.drawingTitle, `%${search}%`),
          like(designDrawings.description, `%${search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(asc(designDrawings.drawingNumber));

    const drawings = await query.execute();

    res.json(drawings);
  } catch (error) {
    console.error('Error fetching drawing registry:', error);
    res.status(500).json({ error: 'Failed to fetch drawing registry' });
  }
});

export default router;
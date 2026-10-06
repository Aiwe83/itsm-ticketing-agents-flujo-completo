import { Request, Response } from 'express'
import logger from '../config/logger'
import { asyncHandler } from '../middlewares/error.middleware'
import { issueService } from '../services/issue.service'
import type { IssueBatchPayload } from '../validators/issue.validator'

export class IssueController {
  processIssues = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { issues, initiatedBy } = req.body as IssueBatchPayload
    const result = await issueService.processIssues(issues, initiatedBy)

    logger.info(
      {
        executionId: result.executionId,
        ticketsProcessed: result.summary.ticketsProcessed,
        ticketsSucceeded: result.summary.ticketsSucceeded,
        ticketsFailed: result.summary.ticketsFailed,
        requestId: req.requestId,
      },
      'Issues processed successfully'
    )

    res.status(201).json({
      success: true,
      message: 'Issues accepted',
      data: result,
    })
  })
}

export const issueController = new IssueController()

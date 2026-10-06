import { Router } from 'express'
import { issueController } from '../controllers/issue.controller'
import { validate } from '../middlewares/validation.middleware'
import { createIssuesSchema } from '../validators/issue.validator'

const router: Router = Router()

router.post('/', validate(createIssuesSchema), issueController.processIssues)

export default router

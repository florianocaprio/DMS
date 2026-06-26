import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import attachmentsRouter from "./attachments";
import usersRouter from "./users";
import classificationsRouter from "./classifications";
import dossiersRouter from "./dossiers";
import documentsRouter from "./documents";
import protocolsRouter from "./protocols";
import tasksRouter from "./tasks";
import workflowsRouter from "./workflows";
import signaturesRouter from "./signatures";
import dashboardRouter from "./dashboard";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(attachmentsRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(classificationsRouter);
router.use(dossiersRouter);
router.use(documentsRouter);
router.use(protocolsRouter);
router.use(tasksRouter);
router.use(workflowsRouter);
router.use(signaturesRouter);
router.use(searchRouter);

export default router;

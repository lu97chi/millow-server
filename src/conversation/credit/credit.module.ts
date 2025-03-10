import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CreditService } from './credit.service';
import { CreditController } from "./credit.controller";
import { Credit, CreditSchema } from "./schemas/credit.schema";
import { OpenAiModule } from "src/openai/openai.module";
import { ConversationModule } from "../conversation.module";

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Credit.name, schema: CreditSchema }
        ]),
        forwardRef(() => OpenAiModule),
        forwardRef(() => ConversationModule) // ✅ Usa forwardRef correctamente
    ],
    controllers: [CreditController],
    providers: [CreditService],
    exports: [CreditService], // ✅ Exporta CreditService para que otros módulos lo usen
})
export class CreditModule {}
